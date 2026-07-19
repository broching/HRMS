"use node";

import Stripe from "stripe";
import { v, ConvexError } from "convex/values";
import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  PLANS,
  type PaidPlanKey,
  type OptionalModuleKey,
  isOptionalModuleKey,
  modulePriceEnvKey,
  coreBreakdown,
} from "./lib/plans";
import { OPTIONAL_MODULES } from "./lib/modules";

/**
 * All Stripe network calls. Runs in the Node runtime so it can use the Stripe
 * SDK (webhook signature verification, Checkout + Billing Portal sessions). It
 * never touches the database directly — reads/writes go through internal
 * queries/mutations in convex/billing.ts.
 */

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new ConvexError({
      code: "CONFIG",
      message:
        "STRIPE_SECRET_KEY is not set in the Convex environment. Add it in the Convex dashboard to enable billing.",
    });
  }
  return new Stripe(key);
}

function appBaseUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

// The Stripe price id for a legacy plan — env override first, then the live id
// baked into the plan catalogue. (Legacy: only for pre-existing subscriptions.)
function resolvePriceId(plan: PaidPlanKey): string {
  const envKey = `STRIPE_PRICE_${plan.toUpperCase()}`;
  const override = process.env[envKey];
  if (override) return override;
  const id = PLANS[plan].stripePriceId;
  if (!id) {
    throw new ConvexError({
      code: "CONFIG",
      message: `No Stripe price configured for the ${plan} plan.`,
    });
  }
  return id;
}

// À la carte model price resolution (env-configured; see plans.ts).
function resolveBasePriceId(): string {
  const id = process.env.STRIPE_PRICE_BASE;
  if (!id) {
    throw new ConvexError({
      code: "CONFIG",
      message: "No Stripe price configured for the Core platform (STRIPE_PRICE_BASE).",
    });
  }
  return id;
}

// Per-employee add-on price ($5/seat) charged on top of a Core tier anchor for
// employees between tiers (see coreBreakdown). Only needed when a team sits
// above an anchor; exact-anchor teams check out with the base tier alone.
function resolveExtraSeatPriceId(): string {
  const id = process.env.STRIPE_PRICE_EXTRA_SEAT;
  if (!id) {
    throw new ConvexError({
      code: "CONFIG",
      message:
        "No Stripe price configured for extra employees (STRIPE_PRICE_EXTRA_SEAT).",
    });
  }
  return id;
}

function resolveModulePriceId(key: OptionalModuleKey): string {
  const id = process.env[modulePriceEnvKey(key)];
  if (!id) {
    throw new ConvexError({
      code: "CONFIG",
      message: `No Stripe price configured for the ${key} module (${modulePriceEnvKey(key)}).`,
    });
  }
  return id;
}

// Reverse map (Stripe price id → module key) for webhook resolution. Skips any
// module whose price env var isn't set.
function modulePriceMap(): Record<string, OptionalModuleKey> {
  const map: Record<string, OptionalModuleKey> = {};
  for (const m of OPTIONAL_MODULES as OptionalModuleKey[]) {
    const id = process.env[modulePriceEnvKey(m)];
    if (id) map[id] = m;
  }
  return map;
}

// ─── Checkout + portal (admin-initiated) ─────────────────────────────────────

// Start a Stripe Checkout session for the Core platform at `seats` employees
// plus the chosen module add-ons. Returns the hosted checkout URL for the client
// to redirect to. Admin-only via the internal authorize query.
export const createCheckoutSession = action({
  args: { seats: v.number(), modules: v.array(v.string()) },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, args) => {
    const seats = Math.max(1, Math.floor(args.seats));
    // De-dupe + keep only real optional modules.
    const modules = [...new Set(args.modules.filter(isOptionalModuleKey))];

    const auth = await ctx.runQuery(internal.billing.authorizeBilling, {});
    const stripe = getStripe();

    // Reuse the org's Stripe customer, or create one on first checkout.
    let customerId = auth.stripeCustomerId;
    const createCustomer = async () => {
      const customer = await stripe.customers.create({
        name: auth.orgName,
        email: auth.email ?? undefined,
        metadata: { orgId: auth.orgId, clerkOrgId: auth.clerkOrgId },
      });
      await ctx.runMutation(internal.billing.setCustomerId, {
        orgId: auth.orgId,
        stripeCustomerId: customer.id,
      });
      return customer.id;
    };
    if (!customerId) {
      customerId = await createCustomer();
    }

    const base = appBaseUrl();
    // Core = a tier anchor billed via the volume-tiered base price (quantity =
    // the anchor's seat count) plus, between anchors, one $5/seat add-on line.
    const core = coreBreakdown(seats);
    const lineItems = [
      { price: resolveBasePriceId(), quantity: core.tierUpTo },
      ...(core.extraSeats > 0
        ? [{ price: resolveExtraSeatPriceId(), quantity: core.extraSeats }]
        : []),
      ...modules.map((m) => ({ price: resolveModulePriceId(m), quantity: 1 })),
    ];
    const sessionParams = {
      mode: "subscription" as const,
      line_items: lineItems,
      client_reference_id: auth.orgId,
      // `modules`/`seats` metadata is authoritative for the webhook: the paid set
      // is still cross-checked against the subscription's line-item prices, but
      // `seats` is the true headcount (the base line quantity is the tier anchor).
      subscription_data: {
        metadata: {
          orgId: auth.orgId,
          modules: modules.join(","),
          seats: String(seats),
        },
      },
      allow_promotion_codes: true,
      billing_address_collection: "auto" as const,
      // Return via the public /billing-return bridge so the client Clerk session
      // re-syncs before the server-protected billing page renders (see
      // features/billing/components/billing-return.tsx).
      success_url: `${base}/billing-return?checkout=success`,
      cancel_url: `${base}/billing-return?checkout=cancel`,
    };

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        ...sessionParams,
        customer: customerId,
      });
    } catch (err) {
      // The stored customer id can go stale (e.g. Stripe test data was
      // cleared in the dashboard) — recreate the customer and retry once.
      if (err instanceof Stripe.errors.StripeInvalidRequestError && err.code === "resource_missing") {
        customerId = await createCustomer();
        session = await stripe.checkout.sessions.create({
          ...sessionParams,
          customer: customerId,
        });
      } else {
        throw err;
      }
    }

    if (!session.url) {
      throw new ConvexError({
        code: "STRIPE",
        message: "Stripe did not return a checkout URL. Please try again.",
      });
    }
    return { url: session.url };
  },
});

// Open the Stripe Billing Portal so an admin can change plan/seats, update the
// card, or cancel. Returns the portal URL.
export const createBillingPortalSession = action({
  args: {},
  returns: v.object({ url: v.string() }),
  handler: async (ctx) => {
    const auth = await ctx.runQuery(internal.billing.authorizeBilling, {});
    if (!auth.stripeCustomerId) {
      throw new ConvexError({
        code: "NO_CUSTOMER",
        message: "No billing account yet. Choose a plan to get started.",
      });
    }
    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: auth.stripeCustomerId,
      // Return via the public /billing-return bridge (see createCheckoutSession).
      return_url: `${appBaseUrl()}/billing-return`,
    });
    return { url: session.url };
  },
});

// ─── Webhook processing ──────────────────────────────────────────────────────

// Verify a Stripe webhook and sync subscription state into Convex. Called by the
// /stripe-webhook HTTP route (which forwards the raw body + signature). Returns
// false on a bad signature so the route can answer 400.
export const processWebhook = internalAction({
  args: { payload: v.string(), signature: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      console.error("STRIPE_WEBHOOK_SECRET is not set — cannot verify webhook.");
      return false;
    }
    const stripe = getStripe();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(args.payload, args.signature, secret);
    } catch (err) {
      console.error("Stripe webhook signature verification failed", err);
      return false;
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const subId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription?.id;
          if (subId) {
            const sub = await stripe.subscriptions.retrieve(subId);
            await syncSubscription(ctx, sub, session.client_reference_id);
          }
          break;
        }
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          await syncSubscription(ctx, sub, null);
          break;
        }
        case "invoice.paid":
        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          const subRef = (invoice as unknown as { subscription?: string | { id: string } })
            .subscription;
          const subId = typeof subRef === "string" ? subRef : subRef?.id;
          if (subId) {
            const sub = await stripe.subscriptions.retrieve(subId);
            await syncSubscription(ctx, sub, null);
          }
          break;
        }
        default:
          // Unhandled event types are acknowledged (200) and ignored.
          break;
      }
    } catch (err) {
      console.error(`Error handling Stripe event ${event.type}`, err);
      // Return false so Stripe retries (transient DB/network issues).
      return false;
    }
    return true;
  },
});

// Normalize a Stripe subscription and persist it. `orgIdHint` comes from
// checkout's client_reference_id when the subscription metadata isn't available.
async function syncSubscription(
  ctx: ActionCtx,
  sub: Stripe.Subscription,
  orgIdHint: string | null,
) {
  const orgId =
    (sub.metadata?.orgId as string | undefined) ?? orgIdHint ?? undefined;
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const item0 = sub.items.data[0];
  const periodEnd =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    (item0 as unknown as { current_period_end?: number } | undefined)
      ?.current_period_end;

  // Resolve the à la carte model from the subscription's line items: the base
  // (Core) line gives seats; each module line gives an entitlement.
  let basePriceId: string | undefined;
  try {
    basePriceId = resolveBasePriceId();
  } catch {
    basePriceId = undefined;
  }
  const modMap = modulePriceMap();

  // True headcount comes from metadata (the base line quantity is only the tier
  // anchor). Fall back to base + extra-seat line quantities for older subs.
  const metaSeats = sub.metadata?.seats
    ? Number(sub.metadata.seats)
    : undefined;
  const extraSeatPriceId = process.env.STRIPE_PRICE_EXTRA_SEAT;

  let baseItem: Stripe.SubscriptionItem | undefined;
  let derivedSeats = 0;
  const modules: OptionalModuleKey[] = [];
  for (const it of sub.items.data) {
    const pid = it.price?.id;
    if (!pid) continue;
    if (basePriceId && pid === basePriceId) {
      baseItem = it;
      derivedSeats += it.quantity ?? 0;
    } else if (extraSeatPriceId && pid === extraSeatPriceId) {
      derivedSeats += it.quantity ?? 0;
    } else if (modMap[pid]) {
      modules.push(modMap[pid]);
    }
  }
  const seats =
    metaSeats && Number.isFinite(metaSeats) && metaSeats > 0
      ? metaSeats
      : derivedSeats > 0
        ? derivedSeats
        : undefined;

  const patch = {
    stripeCustomerId: customerId,
    orgId: orgId as Id<"organizations"> | undefined,
    stripeSubscriptionId: sub.id,
    status: sub.status,
    currentPeriodEnd: periodEnd ? periodEnd * 1000 : undefined,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  };

  if (baseItem) {
    // À la carte model — modules drive the org's entitlements downstream.
    await ctx.runMutation(internal.billing.upsertFromStripe, {
      ...patch,
      plan: undefined,
      modules,
      priceId: basePriceId,
      seats,
    });
  } else {
    // Legacy tiered subscription — preserve the old single-price behaviour.
    const price = item0?.price;
    const plan =
      (price?.metadata?.plan as string | undefined) ??
      resolvePlanFromPriceId(price?.id);
    await ctx.runMutation(internal.billing.upsertFromStripe, {
      ...patch,
      plan,
      modules: undefined,
      priceId: price?.id,
      seats: item0?.quantity,
    });
  }
}

// Fallback plan resolution when a price has no `plan` metadata: match the
// configured price id (incl. env overrides) back to a plan key.
function resolvePlanFromPriceId(priceId: string | undefined): string | undefined {
  if (!priceId) return undefined;
  for (const key of ["starter", "growth", "business"] as PaidPlanKey[]) {
    try {
      if (resolvePriceId(key) === priceId) return key;
    } catch {
      // ignore unconfigured plans
    }
  }
  return undefined;
}
