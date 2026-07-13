import { v, ConvexError } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { PLANS, isPaidPlanKey, type PlanKey } from "./lib/plans";

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
export async function requireSuperAdmin(ctx: QueryCtx) {
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

// Safe for any signed-in user: reports only the caller's own identity plus
// whether they are a super admin. Used by the console to show a setup hint (the
// caller's own user id) without leaking the allow-list.
export const whoami = query({
  args: {},
  returns: v.object({
    subject: v.union(v.string(), v.null()),
    email: v.union(v.string(), v.null()),
    name: v.union(v.string(), v.null()),
    isSuperAdmin: v.boolean(),
  }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { subject: null, email: null, name: null, isSuperAdmin: false };
    }
    return {
      subject: identity.subject,
      email: (identity.email as string | undefined) ?? null,
      name: (identity.name as string | undefined) ?? null,
      isSuperAdmin: superAdminIds().has(identity.subject),
    };
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
      const priceCents = priceFor(sub?.plan, sub?.seats ?? undefined);
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
