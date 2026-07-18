import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { getOrgContext, requirePermission } from "./auth";
import {
  PLANS,
  isPaidPlanKey,
  computeBillingCents,
  type PlanKey,
} from "./lib/plans";
import { OPTIONAL_MODULES, sanitizeModuleKeys } from "./lib/modules";

/**
 * Billing state for the org. The org is the Stripe customer; one `subscriptions`
 * row per org is kept in sync from Stripe webhooks (convex/stripe.ts). This file
 * holds the read side (access gate + billing summary) and the internal mutations
 * the webhook/checkout flow use to write that row. All Stripe API calls live in
 * the Node action file; nothing here touches the network.
 */

// Enforcement is opt-in so existing orgs are never locked out unexpectedly. Set
// the Convex env var BILLING_ENFORCED=true to turn the paywall on.
function billingEnforced(): boolean {
  return process.env.BILLING_ENFORCED === "true";
}

// Stripe subscription statuses that grant access to the app.
const ALLOWED_STATUSES = new Set(["active", "trialing", "past_due"]);

async function subForOrg(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
): Promise<Doc<"subscriptions"> | null> {
  return await ctx.db
    .query("subscriptions")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .unique();
}

// ─── Read side ─────────────────────────────────────────────────────────────

// Lightweight access resolver used by the app-wide billing gate. Called on
// every load, so it stays cheap: no headcount scan, just the subscription row.
export const getAccess = query({
  args: {},
  returns: v.object({
    allowed: v.boolean(),
    // "unenforced" when the paywall is off; otherwise the effective state.
    state: v.union(
      v.literal("unenforced"),
      v.literal("none"),
      v.literal("active"),
      v.literal("trialing"),
      v.literal("past_due"),
      v.literal("canceled"),
      v.literal("incomplete"),
      v.literal("paused"),
    ),
    enforced: v.boolean(),
    // Whether the caller may manage billing (subscribe / open the portal).
    manageable: v.boolean(),
    plan: v.union(v.string(), v.null()),
    orgName: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const orgCtx = await getOrgContext(ctx);
    if (!orgCtx) {
      return {
        allowed: false,
        state: "none" as const,
        enforced: billingEnforced(),
        manageable: false,
        plan: null,
        orgName: null,
      };
    }
    const manageable = orgCtx.permissions.has("org:manage");
    const enforced = billingEnforced();
    const sub = await subForOrg(ctx, orgCtx.orgId);
    const status = sub?.status;

    if (!enforced) {
      return {
        allowed: true,
        state: "unenforced" as const,
        enforced: false,
        manageable,
        plan: sub?.plan ?? null,
        orgName: orgCtx.org.name,
      };
    }

    const allowed = !!status && ALLOWED_STATUSES.has(status);
    const state = ((): (typeof STATES)[number] => {
      if (!status) return "none";
      if (STATE_SET.has(status)) return status as (typeof STATES)[number];
      // Map any other Stripe status (incomplete_expired, unpaid, …) to "none"
      // for the gate — no access, show pricing.
      return "none";
    })();

    return {
      allowed,
      state,
      enforced: true,
      manageable,
      plan: sub?.plan ?? null,
      orgName: orgCtx.org.name,
    };
  },
});

const STATES = [
  "none",
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
  "paused",
] as const;
const STATE_SET = new Set<string>(STATES);

// Rich billing summary for the Billing page. Admin-only (org:manage). Includes
// current headcount so we can show seat usage against the purchased quantity.
export const getBillingSummary = query({
  args: {},
  returns: v.object({
    hasSubscription: v.boolean(),
    enforced: v.boolean(),
    orgName: v.string(),
    plan: v.union(v.string(), v.null()),
    planName: v.union(v.string(), v.null()),
    // À la carte model: the paid optional modules + cost breakdown.
    modules: v.array(v.string()),
    baseCents: v.union(v.number(), v.null()),
    moduleCents: v.union(v.number(), v.null()),
    status: v.union(v.string(), v.null()),
    seats: v.union(v.number(), v.null()),
    priceCents: v.union(v.number(), v.null()),
    currentPeriodEnd: v.union(v.number(), v.null()),
    cancelAtPeriodEnd: v.boolean(),
    hasStripeCustomer: v.boolean(),
    activeEmployees: v.number(),
  }),
  handler: async (ctx) => {
    const { orgId, org } = await requirePermission(ctx, "org:manage");
    const sub = await subForOrg(ctx, orgId);

    // Current billable headcount = everyone not terminated. Orgs are bounded, so
    // a single scan is fine; the terminated filter keeps ex-staff out of the count.
    let activeEmployees = 0;
    const employees = await ctx.db
      .query("employees")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .take(5000);
    for (const e of employees) {
      if (e.status !== "terminated" && !e.isVacant) activeEmployees++;
    }

    // À la carte model when the sub carries a module set; else legacy tiered plan.
    const modules = sub?.modules ?? null;
    const planKey = sub?.plan && sub.plan in PLANS ? (sub.plan as PlanKey) : null;

    let priceCents: number | null = null;
    let baseCents: number | null = null;
    let moduleCents: number | null = null;
    if (modules && sub?.seats != null) {
      const b = computeBillingCents(sub.seats, modules);
      priceCents = b.totalCents;
      baseCents = b.baseCents;
      moduleCents = b.moduleCents;
    } else if (planKey && sub?.seats != null && isPaidPlanKey(planKey)) {
      priceCents = computeFromPlan(planKey, sub.seats);
    }

    return {
      hasSubscription: !!sub?.stripeSubscriptionId && !!sub?.status,
      enforced: billingEnforced(),
      orgName: org.name,
      plan: sub?.plan ?? null,
      planName: planKey ? PLANS[planKey].name : null,
      modules: modules ?? [],
      baseCents,
      moduleCents,
      status: sub?.status ?? null,
      seats: sub?.seats ?? null,
      priceCents,
      currentPeriodEnd: sub?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
      hasStripeCustomer: !!sub?.stripeCustomerId,
      activeEmployees,
    };
  },
});

function computeFromPlan(key: PlanKey, seats: number): number | null {
  const plan = PLANS[key];
  if (plan.baseCents === null || plan.extraSeatCents === null) return null;
  const extra = Math.max(0, seats - plan.includedSeats);
  return plan.baseCents + extra * plan.extraSeatCents;
}

// ─── Internal: authorization + write side (used by convex/stripe.ts) ─────────

// Authorize a billing action and hand back what the Stripe action needs. Throws
// if the caller can't manage the org's billing.
export const authorizeBilling = internalQuery({
  args: {},
  returns: v.object({
    orgId: v.id("organizations"),
    clerkOrgId: v.string(),
    orgName: v.string(),
    email: v.union(v.string(), v.null()),
    stripeCustomerId: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const { orgId, org, user } = await requirePermission(ctx, "org:manage");
    const sub = await subForOrg(ctx, orgId);
    return {
      orgId,
      clerkOrgId: org.clerkOrgId,
      orgName: org.name,
      email: user.email ?? null,
      stripeCustomerId: sub?.stripeCustomerId ?? null,
    };
  },
});

// Persist the Stripe customer id for an org (first time an admin starts checkout).
export const setCustomerId = internalMutation({
  args: { orgId: v.id("organizations"), stripeCustomerId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await subForOrg(ctx, args.orgId);
    if (existing) {
      if (existing.stripeCustomerId !== args.stripeCustomerId) {
        await ctx.db.patch(existing._id, {
          stripeCustomerId: args.stripeCustomerId,
        });
      }
      return null;
    }
    await ctx.db.insert("subscriptions", {
      orgId: args.orgId,
      stripeCustomerId: args.stripeCustomerId,
    });
    return null;
  },
});

// Upsert subscription state from a Stripe webhook. Resolves the target org by
// customer id first (the row is created at checkout start), falling back to the
// orgId carried in subscription metadata.
export const upsertFromStripe = internalMutation({
  args: {
    stripeCustomerId: v.string(),
    orgId: v.optional(v.id("organizations")),
    stripeSubscriptionId: v.optional(v.string()),
    plan: v.optional(v.string()),
    // The paid optional-module set (à la carte model). Undefined for legacy subs.
    modules: v.optional(v.array(v.string())),
    priceId: v.optional(v.string()),
    status: v.string(),
    seats: v.optional(v.number()),
    currentPeriodEnd: v.optional(v.number()),
    cancelAtPeriodEnd: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const patch = {
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      plan: args.plan,
      modules: args.modules,
      priceId: args.priceId,
      status: args.status,
      seats: args.seats,
      currentPeriodEnd: args.currentPeriodEnd,
      cancelAtPeriodEnd: args.cancelAtPeriodEnd,
    };

    let row =
      (await ctx.db
        .query("subscriptions")
        .withIndex("by_customer", (q) =>
          q.eq("stripeCustomerId", args.stripeCustomerId),
        )
        .first()) ?? null;

    if (!row && args.orgId) {
      row = await subForOrg(ctx, args.orgId);
    }

    const orgId = row?.orgId ?? args.orgId;
    if (row) {
      await ctx.db.patch(row._id, patch);
    } else if (args.orgId) {
      await ctx.db.insert("subscriptions", { orgId: args.orgId, ...patch });
    }

    // Link billing → entitlements: when the à la carte model is in play, the
    // org's enabled modules become exactly what it pays for (core always on).
    // A subscription with an ACTIVE-ish status grants its modules; a dead one
    // (canceled/unpaid/…) grants none. Legacy subs (modules undefined) don't
    // touch entitlements, so existing orgs keep everything.
    if (args.modules !== undefined && orgId) {
      const paid = ALLOWED_STATUSES.has(args.status)
        ? new Set(sanitizeModuleKeys(args.modules))
        : new Set<string>();
      const disabled = OPTIONAL_MODULES.filter((m) => !paid.has(m));
      await syncOrgModules(ctx, orgId, disabled);
    }
    return null;
  },
});

// Upsert the org's disabled-module set (see convex/lib/modules.ts). Kept in this
// file because billing is the writer that links purchases to entitlements.
async function syncOrgModules(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  disabled: string[],
) {
  const existing = await ctx.db
    .query("orgModules")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, { disabled });
  } else {
    await ctx.db.insert("orgModules", { orgId, disabled });
  }
}
