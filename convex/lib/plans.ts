/**
 * Subscription plan catalogue. Framework-agnostic (no Convex/Next imports) so it
 * is shared by the Convex backend (checkout + webhook resolution) and the client
 * (pricing UI + live price math), imported on the client via `@/convex/lib/plans`.
 *
 * Billing model: the ORGANIZATION is the Stripe customer. Each paid plan is a
 * single graduated tiered price in Stripe, and the subscription quantity = the
 * number of employee seats. Stripe computes "base + additional employees" from
 * the tiers; `computeMonthlyCents` mirrors that math for the UI so what a buyer
 * sees always matches what Stripe will charge.
 *
 * All amounts are in SGD cents. Prices below are the LIVE Stripe price IDs; the
 * server may override any of them with a `STRIPE_PRICE_<PLAN>` env var (e.g. to
 * point at test-mode prices during development) — see convex/stripe.ts.
 */

export type PaidPlanKey = "starter" | "growth" | "business";
export type PlanKey = PaidPlanKey | "enterprise";

export type Plan = {
  key: PlanKey;
  name: string;
  tagline: string;
  /** Flat monthly base in SGD cents (covers up to `includedSeats`). */
  baseCents: number | null; // null → custom (enterprise)
  /** Seats included in the base price. */
  includedSeats: number;
  /** Price per employee beyond `includedSeats`, in SGD cents. */
  extraSeatCents: number | null;
  /** Live Stripe price id. Absent for enterprise (sales-led). */
  stripePriceId?: string;
  popular?: boolean;
};

// Every plan ships the full product — the difference is headcount + per-seat
// rate, never features. Shown identically on each card.
export const PLAN_FEATURES: string[] = [
  "Payroll",
  "Attendance",
  "Timesheets & Project Management",
  "Claims",
  "Payment Requests",
  "Leave Management",
  "Performance Management",
  "Equipment Management & Tracking",
];

export const PLANS: Record<PlanKey, Plan> = {
  starter: {
    key: "starter",
    name: "Starter",
    tagline:
      "For startups and small businesses beginning to digitise their HR.",
    baseCents: 4900,
    includedSeats: 10,
    extraSeatCents: 500,
    stripePriceId: "price_1TsNH3DGm4rtWKHTkkdWWgBd",
  },
  growth: {
    key: "growth",
    name: "Growth",
    tagline: "For growing businesses that need an all-in-one HR platform.",
    baseCents: 14900,
    includedSeats: 50,
    extraSeatCents: 400,
    stripePriceId: "price_1TsNH5DGm4rtWKHTyoJiNm6O",
    popular: true,
  },
  business: {
    key: "business",
    name: "Business",
    tagline: "For established organisations with larger teams.",
    baseCents: 29900,
    includedSeats: 150,
    extraSeatCents: 300,
    stripePriceId: "price_1TsNH8DGm4rtWKHT0dCWdp5V",
  },
  enterprise: {
    key: "enterprise",
    name: "Enterprise",
    tagline: "For large organisations with 150+ employees.",
    baseCents: null,
    includedSeats: 150,
    extraSeatCents: null,
  },
};

export const PAID_PLAN_KEYS: PaidPlanKey[] = ["starter", "growth", "business"];
export const PLAN_ORDER: PlanKey[] = [
  "starter",
  "growth",
  "business",
  "enterprise",
];

export function isPaidPlanKey(key: string): key is PaidPlanKey {
  return (PAID_PLAN_KEYS as string[]).includes(key);
}

/**
 * Monthly cost in SGD cents for a plan at `seats` employees, mirroring Stripe's
 * graduated tiers. Returns null for custom-priced plans (enterprise).
 */
export function computeMonthlyCents(key: PlanKey, seats: number): number | null {
  const plan = PLANS[key];
  if (plan.baseCents === null || plan.extraSeatCents === null) return null;
  const extra = Math.max(0, Math.ceil(seats) - plan.includedSeats);
  return plan.baseCents + extra * plan.extraSeatCents;
}

/** Extra seats (beyond the included tier) charged at a plan's per-seat rate. */
export function extraSeats(key: PlanKey, seats: number): number {
  return Math.max(0, Math.ceil(seats) - PLANS[key].includedSeats);
}

/**
 * The plan we recommend for a team of `seats` — the lowest *total* monthly cost,
 * accounting for per-seat overage (a smaller plan with a few extra seats often
 * beats jumping a tier). Past Business's included tier the product is sales-led,
 * so we recommend Enterprise.
 */
export function recommendedPlan(seats: number): PlanKey {
  if (seats > PLANS.business.includedSeats) return "enterprise";
  let best: PaidPlanKey = "starter";
  let bestCost = Infinity;
  for (const key of PAID_PLAN_KEYS) {
    const cost = computeMonthlyCents(key, seats);
    if (cost !== null && cost < bestCost) {
      bestCost = cost;
      best = key;
    }
  }
  return best;
}

const SGD = new Intl.NumberFormat("en-SG", {
  style: "currency",
  currency: "SGD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const SGD_CENTS = new Intl.NumberFormat("en-SG", {
  style: "currency",
  currency: "SGD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format SGD cents as e.g. "S$149" (whole) or "S$5.00" (with cents). */
export function formatSgd(cents: number, withCents = false): string {
  return (withCents ? SGD_CENTS : SGD).format(cents / 100);
}
