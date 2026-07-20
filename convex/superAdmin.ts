import { v, ConvexError } from "convex/values";
import { query, mutation, action } from "./_generated/server";
import type { QueryCtx, MutationCtx, ActionCtx } from "./_generated/server";
import {
  PLANS,
  isPaidPlanKey,
  computeBillingCents,
  type PlanKey,
} from "./lib/plans";
import type { Doc } from "./_generated/dataModel";
import {
  MODULES,
  MODULE_META,
  OPTIONAL_MODULES,
  enabledModulesFromDisabled,
  sanitizeModuleKeys,
} from "./lib/modules";

/**
 * Platform super-admin console. This is the ONE place that deliberately crosses
 * tenant boundaries (reads every organization), so it is locked down hard:
 *
 *  - Access is granted ONLY by the `SUPER_ADMIN_USER_IDS` Convex env var — a
 *    comma-separated allow-list of Clerk user ids (the JWT `subject`). There is
 *    no database row, no org role, and no in-app UI that can grant it, so a
 *    compromised or malicious *tenant* admin has no privilege-escalation path.
 *  - Every cross-org query calls `requireSuperAdmin` first; it never trusts a
 *    client-supplied id and derives the caller purely from the verified JWT.
 *  - The allow-list is read server-side only and never sent to the client.
 *  - All functions here are read-only — no cross-tenant writes are exposed.
 */

function superAdminIds(): Set<string> {
  const raw = process.env.SUPER_ADMIN_USER_IDS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** Throw unless the verified caller is on the super-admin allow-list. */
export async function requireSuperAdmin(
  ctx: QueryCtx | MutationCtx | ActionCtx,
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "Sign in required.",
    });
  }
  const ids = superAdminIds();
  if (ids.size === 0 || !ids.has(identity.subject)) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Super admin access required.",
    });
  }
  return identity;
}

// Safe for any signed-in user, but deliberately tight-lipped: it reports whether
// the caller is a super admin and NOTHING that identifies them unless they are.
// Non-super-admins never receive their own user id / email here — the console
// treats them as a 404, so there is no page that echoes a Clerk user id back to
// a random signed-in user (which would hand out the exact value needed to probe
// the SUPER_ADMIN_USER_IDS allow-list).
export const whoami = query({
  args: {},
  returns: v.object({
    email: v.union(v.string(), v.null()),
    name: v.union(v.string(), v.null()),
    isSuperAdmin: v.boolean(),
  }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const isSuperAdmin =
      !!identity && superAdminIds().has(identity.subject);
    if (!identity || !isSuperAdmin) {
      return { email: null, name: null, isSuperAdmin };
    }
    return {
      email: (identity.email as string | undefined) ?? null,
      name: (identity.name as string | undefined) ?? null,
      isSuperAdmin: true,
    };
  },
});

// ─── Contact leads (landing "Contact us" form → this inbox) ──────────────────

const LEAD_STATUS = v.union(
  v.literal("new"),
  v.literal("contacted"),
  v.literal("archived"),
);

// Every lead captured from the public landing form, newest first. Super-admin
// only — the same allow-list that gates the rest of the console.
export const leads = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.id("contactLeads"),
      name: v.string(),
      email: v.string(),
      company: v.union(v.string(), v.null()),
      product: v.union(v.string(), v.null()),
      message: v.string(),
      source: v.union(v.string(), v.null()),
      status: LEAD_STATUS,
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);
    const rows = await ctx.db.query("contactLeads").order("desc").take(500);
    return rows.map((r) => ({
      id: r._id,
      name: r.name,
      email: r.email,
      company: r.company ?? null,
      product: r.product ?? null,
      message: r.message,
      source: r.source ?? null,
      status: r.status ?? ("new" as const),
      createdAt: r._creationTime,
    }));
  },
});

// Move a lead through the inbox (new → contacted → archived). Super-admin only.
export const setLeadStatus = mutation({
  args: { leadId: v.id("contactLeads"), status: LEAD_STATUS },
  returns: v.null(),
  handler: async (ctx, { leadId, status }) => {
    await requireSuperAdmin(ctx);
    await ctx.db.patch(leadId, { status });
    return null;
  },
});

function priceFor(plan: string | undefined, seats: number | undefined) {
  if (!plan || seats == null || !(plan in PLANS)) return null;
  const key = plan as PlanKey;
  if (!isPaidPlanKey(key)) return null;
  const p = PLANS[key];
  if (p.baseCents === null || p.extraSeatCents === null) return null;
  return p.baseCents + Math.max(0, seats - p.includedSeats) * p.extraSeatCents;
}

// Monthly price for a subscription under whichever model it uses: à la carte
// (base + module add-ons) when it carries a module set, else legacy tiered plan.
function priceForSub(sub: Doc<"subscriptions"> | null): number | null {
  if (!sub) return null;
  if (sub.modules && sub.seats != null) {
    return computeBillingCents(sub.seats, sub.modules).totalCents;
  }
  return priceFor(sub.plan, sub.seats ?? undefined);
}

const ACTIVE_SUB = new Set(["active", "trialing", "past_due"]);

const orgRow = v.object({
  orgId: v.id("organizations"),
  name: v.string(),
  slug: v.union(v.string(), v.null()),
  country: v.string(),
  createdAt: v.number(),
  plan: v.union(v.string(), v.null()),
  planName: v.union(v.string(), v.null()),
  status: v.union(v.string(), v.null()),
  seats: v.union(v.number(), v.null()),
  priceCents: v.union(v.number(), v.null()),
  currentPeriodEnd: v.union(v.number(), v.null()),
  memberCount: v.number(),
  activeEmployees: v.number(),
});

// Platform overview: aggregate stats + one row per organization. Super-admin only.
export const overview = query({
  args: {},
  returns: v.object({
    stats: v.object({
      totalOrgs: v.number(),
      totalUsers: v.number(),
      totalMembers: v.number(),
      activeEmployees: v.number(),
      activeSubscriptions: v.number(),
      payingOrgs: v.number(),
      estMrrCents: v.number(),
    }),
    orgs: v.array(orgRow),
  }),
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);

    const orgs = await ctx.db.query("organizations").take(2000);

    let totalMembers = 0;
    let activeEmployeesTotal = 0;
    let activeSubscriptions = 0;
    let payingOrgs = 0;
    let estMrrCents = 0;

    const rows = [];
    for (const org of orgs) {
      const sub = await ctx.db
        .query("subscriptions")
        .withIndex("by_org", (q) => q.eq("orgId", org._id))
        .unique();

      const members = await ctx.db
        .query("members")
        .withIndex("by_org", (q) => q.eq("orgId", org._id))
        .take(10000);
      const memberCount = members.length;
      totalMembers += memberCount;

      const employees = await ctx.db
        .query("employees")
        .withIndex("by_org", (q) => q.eq("orgId", org._id))
        .take(10000);
      let activeEmployees = 0;
      for (const e of employees) {
        if (e.status !== "terminated" && !e.isVacant) activeEmployees++;
      }
      activeEmployeesTotal += activeEmployees;

      const planKey =
        sub?.plan && sub.plan in PLANS ? (sub.plan as PlanKey) : null;
      const priceCents = priceForSub(sub);
      const isActive = !!sub?.status && ACTIVE_SUB.has(sub.status);
      if (isActive) {
        activeSubscriptions++;
        if (priceCents) {
          payingOrgs++;
          estMrrCents += priceCents;
        }
      }

      rows.push({
        orgId: org._id,
        name: org.name,
        slug: org.slug ?? null,
        country: org.country,
        createdAt: org._creationTime,
        plan: sub?.plan ?? null,
        planName: planKey ? PLANS[planKey].name : null,
        status: sub?.status ?? null,
        seats: sub?.seats ?? null,
        priceCents,
        currentPeriodEnd: sub?.currentPeriodEnd ?? null,
        memberCount,
        activeEmployees,
      });
    }

    rows.sort((a, b) => b.createdAt - a.createdAt);

    // Distinct platform users (bounded scan — fine at platform scale).
    const users = await ctx.db.query("users").take(20000);

    return {
      stats: {
        totalOrgs: orgs.length,
        totalUsers: users.length,
        totalMembers,
        activeEmployees: activeEmployeesTotal,
        activeSubscriptions,
        payingOrgs,
        estMrrCents,
      },
      orgs: rows,
    };
  },
});

// The users belonging to one organization (drill-down). Super-admin only.
export const orgUsers = query({
  args: { orgId: v.id("organizations") },
  returns: v.array(
    v.object({
      memberId: v.id("members"),
      userId: v.union(v.id("users"), v.null()),
      name: v.string(),
      email: v.union(v.string(), v.null()),
      username: v.union(v.string(), v.null()),
      role: v.string(),
      roleName: v.union(v.string(), v.null()),
      status: v.string(),
      joinedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);

    const members = await ctx.db
      .query("members")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .take(10000);

    const out = [];
    for (const m of members) {
      const user = await ctx.db.get(m.userId);
      const roleDoc = m.roleId ? await ctx.db.get(m.roleId) : null;
      out.push({
        memberId: m._id,
        userId: m.userId ?? null,
        name: user?.name ?? "Unknown",
        email: user?.email ?? null,
        username: user?.username ?? null,
        role: m.role,
        roleName: roleDoc?.name ?? null,
        status: m.status,
        joinedAt: m._creationTime,
      });
    }
    out.sort((a, b) => a.joinedAt - b.joinedAt);
    return out;
  },
});

// ─── Org drill-down: billing + module entitlements ───────────────────────────

const moduleStateRow = v.object({
  key: v.string(),
  name: v.string(),
  description: v.string(),
  always: v.boolean(),
  enabled: v.boolean(),
});

// Full detail for one org: meta, billing, and module entitlement state.
export const orgDetail = query({
  args: { orgId: v.id("organizations") },
  returns: v.object({
    org: v.object({
      orgId: v.id("organizations"),
      name: v.string(),
      slug: v.union(v.string(), v.null()),
      country: v.string(),
      createdAt: v.number(),
      memberCount: v.number(),
      activeEmployees: v.number(),
    }),
    billing: v.object({
      plan: v.union(v.string(), v.null()),
      planName: v.union(v.string(), v.null()),
      modules: v.array(v.string()),
      status: v.union(v.string(), v.null()),
      seats: v.union(v.number(), v.null()),
      priceCents: v.union(v.number(), v.null()),
      currentPeriodEnd: v.union(v.number(), v.null()),
      cancelAtPeriodEnd: v.boolean(),
      hasStripeCustomer: v.boolean(),
      hasSubscription: v.boolean(),
    }),
    modules: v.array(moduleStateRow),
  }),
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);

    const org = await ctx.db.get(args.orgId);
    if (!org) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Org not found." });
    }

    const members = await ctx.db
      .query("members")
      .withIndex("by_org", (q) => q.eq("orgId", org._id))
      .take(10000);

    const employees = await ctx.db
      .query("employees")
      .withIndex("by_org", (q) => q.eq("orgId", org._id))
      .take(10000);
    let activeEmployees = 0;
    for (const e of employees) {
      if (e.status !== "terminated" && !e.isVacant) activeEmployees++;
    }

    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_org", (q) => q.eq("orgId", org._id))
      .unique();
    const planKey =
      sub?.plan && sub.plan in PLANS ? (sub.plan as PlanKey) : null;
    const priceCents = priceForSub(sub);

    const modRow = await ctx.db
      .query("orgModules")
      .withIndex("by_org", (q) => q.eq("orgId", org._id))
      .unique();
    const enabled = enabledModulesFromDisabled(modRow?.disabled);
    const modules = MODULES.map((key) => ({
      key,
      name: MODULE_META[key].name,
      description: MODULE_META[key].description,
      always: MODULE_META[key].always ?? false,
      enabled: enabled.has(key),
    }));

    return {
      org: {
        orgId: org._id,
        name: org.name,
        slug: org.slug ?? null,
        country: org.country,
        createdAt: org._creationTime,
        memberCount: members.length,
        activeEmployees,
      },
      billing: {
        plan: sub?.plan ?? null,
        planName: planKey ? PLANS[planKey].name : null,
        modules: sub?.modules ?? [],
        status: sub?.status ?? null,
        seats: sub?.seats ?? null,
        priceCents,
        currentPeriodEnd: sub?.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
        hasStripeCustomer: !!sub?.stripeCustomerId,
        hasSubscription: !!sub?.stripeSubscriptionId && !!sub?.status,
      },
      modules,
    };
  },
});

// ─── Org drill-down: derived resource-consumption analytics ──────────────────

// Last `n` months as "YYYY-MM" keys, oldest first (includes the current month).
function lastMonths(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(monthKey(d.getTime()));
  }
  return out;
}

function monthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// "YYYY-MM-DD" (or any ISO date) → "YYYY-MM"; null-safe.
function isoMonth(iso: string | undefined): string | null {
  if (!iso || iso.length < 7) return null;
  return iso.slice(0, 7);
}

const TAKE = 20000;

// Meaningful, live metrics computed from the org's OWN tenant data. (Convex's
// raw infra usage — function calls, bandwidth, storage GB — is not queryable
// from app code; the platform dashboard exposes that separately.)
export const orgAnalytics = query({
  args: { orgId: v.id("organizations") },
  returns: v.object({
    headcount: v.array(
      v.object({
        month: v.string(),
        active: v.number(),
        hires: v.number(),
        exits: v.number(),
      }),
    ),
    recordsByModule: v.array(
      v.object({ key: v.string(), label: v.string(), count: v.number() }),
    ),
    activity: v.array(v.object({ month: v.string(), count: v.number() })),
    storage: v.object({
      documents: v.number(),
      signatures: v.number(),
      feedAttachments: v.number(),
    }),
    totals: v.object({
      members: v.number(),
      activeEmployees: v.number(),
      terminatedEmployees: v.number(),
    }),
  }),
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    const orgId = args.orgId;
    const months = lastMonths(12);
    const monthSet = new Set(months);

    // Employees → headcount timeline (join/exit dated) + status totals.
    const employees = await ctx.db
      .query("employees")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .take(TAKE);
    const realEmployees = employees.filter((e) => !e.isVacant);

    const hiresByMonth: Record<string, number> = {};
    const exitsByMonth: Record<string, number> = {};
    for (const m of months) {
      hiresByMonth[m] = 0;
      exitsByMonth[m] = 0;
    }
    for (const e of realEmployees) {
      const jm = isoMonth(e.joinDate);
      if (jm && monthSet.has(jm)) hiresByMonth[jm]++;
      const xm = isoMonth(e.exitDate);
      if (xm && monthSet.has(xm)) exitsByMonth[xm]++;
    }
    const headcount = months.map((m) => {
      // Active at end of month m: joined on/before, not exited on/before.
      const end = m; // compare "YYYY-MM" lexically (same length) is monotonic
      let active = 0;
      for (const e of realEmployees) {
        const jm = isoMonth(e.joinDate);
        if (!jm || jm > end) continue;
        const xm = isoMonth(e.exitDate);
        if (e.status === "terminated" && xm && xm <= end) continue;
        active++;
      }
      return { month: m, active, hires: hiresByMonth[m], exits: exitsByMonth[m] };
    });

    let terminatedEmployees = 0;
    let activeEmployees = 0;
    for (const e of realEmployees) {
      if (e.status === "terminated") terminatedEmployees++;
      else activeEmployees++;
    }

    // Per-module record counts (one representative table each) + an activity
    // timeline bucketed by creation month from the higher-volume tables.
    const activityByMonth: Record<string, number> = {};
    for (const m of months) activityByMonth[m] = 0;
    const bumpActivity = (rows: { _creationTime: number }[]) => {
      for (const r of rows) {
        const mk = monthKey(r._creationTime);
        if (mk in activityByMonth) activityByMonth[mk]++;
      }
    };

    const leaveRequests = await ctx.db
      .query("leaveRequests")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .take(TAKE);
    const claims = await ctx.db
      .query("claims")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .take(TAKE);
    const paymentRequests = await ctx.db
      .query("paymentRequests")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .take(TAKE);
    const attendanceRecords = await ctx.db
      .query("attendanceRecords")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .take(TAKE);
    const payrollRuns = await ctx.db
      .query("payrollRuns")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .take(TAKE);
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .take(TAKE);
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .take(TAKE);
    const candidates = await ctx.db
      .query("candidates")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .take(TAKE);
    const feedPosts = await ctx.db
      .query("feedPosts")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .take(TAKE);
    const timeEntries = await ctx.db
      .query("timeEntries")
      .withIndex("by_org_date", (q) => q.eq("orgId", orgId))
      .take(TAKE);
    const documents = await ctx.db
      .query("employeeDocuments")
      .withIndex("by_org_type", (q) => q.eq("orgId", orgId))
      .take(TAKE);
    const signatures = await ctx.db
      .query("savedSignatures")
      .withIndex("by_org_and_user", (q) => q.eq("orgId", orgId))
      .take(TAKE);

    bumpActivity(leaveRequests);
    bumpActivity(claims);
    bumpActivity(paymentRequests);
    bumpActivity(attendanceRecords);
    bumpActivity(timeEntries);

    const recordsByModule = [
      { key: "leave", label: "Leave requests", count: leaveRequests.length },
      { key: "claims", label: "Claims", count: claims.length },
      {
        key: "payment_requests",
        label: "Payment requests",
        count: paymentRequests.length,
      },
      { key: "payroll", label: "Payroll runs", count: payrollRuns.length },
      {
        key: "attendance",
        label: "Attendance records",
        count: attendanceRecords.length,
      },
      { key: "timesheets", label: "Time entries", count: timeEntries.length },
      { key: "performance", label: "Reviews", count: reviews.length },
      {
        key: "recruitment",
        label: "Jobs & candidates",
        count: jobs.length + candidates.length,
      },
    ];

    const feedAttachments = feedPosts.reduce(
      (n, p) => n + (p.mediaStorageIds?.length ?? 0),
      0,
    );

    const members = await ctx.db
      .query("members")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .take(TAKE);

    return {
      headcount,
      recordsByModule,
      activity: months.map((m) => ({ month: m, count: activityByMonth[m] })),
      storage: {
        documents: documents.length,
        signatures: signatures.length,
        feedAttachments,
      },
      totals: {
        members: members.length,
        activeEmployees,
        terminatedEmployees,
      },
    };
  },
});

// ─── System configuration: toggle modules per org ────────────────────────────

// Set the org's disabled-module list. Super-admin only; `core` can't be
// disabled and unknown keys are dropped. Absence of a row means all-enabled.
export const setOrgModules = mutation({
  args: {
    orgId: v.id("organizations"),
    disabled: v.array(v.string()),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);

    const org = await ctx.db.get(args.orgId);
    if (!org) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Org not found." });
    }

    // Keep only real optional modules (never `core`, never unknown keys).
    const optional = new Set<string>(OPTIONAL_MODULES);
    const disabled = [
      ...new Set(sanitizeModuleKeys(args.disabled).filter((m) => optional.has(m))),
    ];

    const existing = await ctx.db
      .query("orgModules")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { disabled });
    } else {
      await ctx.db.insert("orgModules", { orgId: args.orgId, disabled });
    }
    return disabled;
  },
});

// ─── Platform: Convex projects & deployments (Management API) ─────────────────

/**
 * Every Convex project in our team, each with its production deployment URL.
 *
 * Enterprise customers run on a **dedicated, single-tenant Convex deployment**
 * (its own database + keys), created as a **separate project** in the same
 * Convex team (see docs/enterprise-deployments.md). Those projects never appear
 * in the tenant-data queries above — they live in a different deployment — so
 * this action reaches out to the Convex **Management API** to enumerate them
 * alongside the shared deployment, giving the console a single fleet view.
 *
 * Auth: `Bearer` a **Team Access Token** (Convex dashboard → Team Settings →
 * Access Tokens). Configure two env vars on THIS deployment:
 *   - `CONVEX_MANAGEMENT_TOKEN` — the team access token
 *   - `CONVEX_TEAM_ID`          — the numeric team id shown when creating it
 * The token is read server-side only and never reaches the client. Absent
 * config degrades gracefully to `configured: false` (the console shows a setup
 * hint, visible only to super admins).
 */
const platformProjectRow = v.object({
  id: v.string(),
  name: v.string(),
  slug: v.string(),
  teamSlug: v.string(),
  createTime: v.number(),
  prodDeploymentName: v.union(v.string(), v.null()),
  prodDeploymentUrl: v.union(v.string(), v.null()),
  prodLastDeployTime: v.union(v.number(), v.null()),
  dashboardUrl: v.union(v.string(), v.null()),
  isCurrent: v.boolean(),
});

export const platformProjects = action({
  args: {},
  returns: v.object({
    configured: v.boolean(),
    error: v.union(v.string(), v.null()),
    currentDeploymentUrl: v.union(v.string(), v.null()),
    projects: v.array(platformProjectRow),
  }),
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);

    const token = process.env.CONVEX_MANAGEMENT_TOKEN;
    const teamId = process.env.CONVEX_TEAM_ID;
    // System env every Convex deployment sets — the URL of THIS deployment, so
    // we can flag which project's prod deployment is the one we're running on.
    const currentUrl = process.env.CONVEX_CLOUD_URL ?? null;

    if (!token || !teamId) {
      return {
        configured: false,
        error: null,
        currentDeploymentUrl: currentUrl,
        projects: [],
      };
    }

    const base = "https://api.convex.dev/v1";
    const headers = { Authorization: `Bearer ${token}` };

    // Follow cursor pagination until exhausted; `items` + `pagination` shape is
    // consistent across the Management API's paginated endpoints.
    async function fetchAll(
      path: string,
      params: Record<string, string>,
    ): Promise<Array<Record<string, unknown>>> {
      const out: Array<Record<string, unknown>> = [];
      let cursor: string | null = null;
      // Bound the loop so a misbehaving cursor can never spin forever.
      for (let page = 0; page < 100; page++) {
        const url = new URL(`${base}${path}`);
        url.searchParams.set("limit", "100");
        for (const [k, val] of Object.entries(params)) {
          url.searchParams.set(k, val);
        }
        if (cursor) url.searchParams.set("cursor", cursor);
        const res = await fetch(url.toString(), { headers });
        if (!res.ok) {
          throw new Error(
            `Convex Management API ${path} → ${res.status} ${res.statusText}`,
          );
        }
        const body = (await res.json()) as {
          items?: Array<Record<string, unknown>>;
          pagination?: { hasMore?: boolean; nextCursor?: string | null };
        };
        if (Array.isArray(body.items)) out.push(...body.items);
        const pg = body.pagination;
        if (pg?.hasMore && pg.nextCursor) {
          cursor = pg.nextCursor;
        } else {
          break;
        }
      }
      return out;
    }

    try {
      const projects = await fetchAll(`/teams/${teamId}/projects`, {});
      const deployments = await fetchAll(`/teams/${teamId}/list_deployments`, {
        deploymentType: "prod",
      });

      // Pick each project's default cloud prod deployment (fall back to any).
      const prodByProject = new Map<string, Record<string, unknown>>();
      for (const d of deployments) {
        if (d.kind !== "cloud") continue;
        const key = String(d.projectId);
        const existing = prodByProject.get(key);
        if (!existing || (d.isDefault === true && existing.isDefault !== true)) {
          prodByProject.set(key, d);
        }
      }

      const rows = projects.map((p) => {
        const dep = prodByProject.get(String(p.id)) ?? null;
        const prodUrl = (dep?.deploymentUrl as string | undefined) ?? null;
        const slug = String(p.slug ?? "");
        const teamSlug = String(p.teamSlug ?? "");
        return {
          id: String(p.id),
          name: String(p.name ?? slug),
          slug,
          teamSlug,
          createTime: Number(p.createTime ?? 0),
          prodDeploymentName:
            (dep?.name as string | undefined) ??
            (p.prodDeploymentName as string | undefined) ??
            null,
          prodDeploymentUrl: prodUrl,
          prodLastDeployTime:
            dep && typeof dep.lastDeployTime === "number"
              ? dep.lastDeployTime
              : null,
          dashboardUrl:
            teamSlug && slug
              ? `https://dashboard.convex.dev/t/${teamSlug}/${slug}`
              : null,
          isCurrent: !!prodUrl && !!currentUrl && prodUrl === currentUrl,
        };
      });
      rows.sort((a, b) => b.createTime - a.createTime);

      return {
        configured: true,
        error: null,
        currentDeploymentUrl: currentUrl,
        projects: rows,
      };
    } catch (e) {
      return {
        configured: true,
        error: e instanceof Error ? e.message : String(e),
        currentDeploymentUrl: currentUrl,
        projects: [],
      };
    }
  },
});
