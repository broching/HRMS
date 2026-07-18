/**
 * Subscription pricing catalogue. Framework-agnostic (no Convex/Next imports) so
 * it is shared by the Convex backend (checkout + webhook resolution) and the
 * client (pricing UI + live price math), imported on the client via
 * `@/convex/lib/plans`.
 *
 * Billing model (à la carte): the ORGANIZATION is the Stripe customer. A
 * subscription is a **tiered Core platform fee** (priced by team size — quantity
 * = employee seats, billed via a volume-tiered Stripe price) plus a **flat
 * monthly add-on per enabled module** (see `MODULE_PRICING`). What an org pays
 * for is what's enabled — the webhook syncs the paid module set into the
 * `orgModules` entitlement table (convex/billing.ts).
 *
 * All amounts are in SGD cents. The Stripe price ids come from env overrides
 * (`STRIPE_PRICE_BASE`, `STRIPE_PRICE_MODULE_<KEY>`) resolved in convex/stripe.ts.
 *
 * The LEGACY tiered `PLANS` (Starter/Growth/Business/Enterprise) below are kept
 * only to render pre-existing subscriptions; new checkouts use the module model.
 */
import type { ModuleKey } from "./modules";
import { OPTIONAL_MODULES, MODULE_META } from "./modules";

// ─── À la carte module pricing (current model) ───────────────────────────────

export type OptionalModuleKey = Exclude<ModuleKey, "core">;

/**
 * Core platform price by team size (SGD cents). Volume-tiered: an org pays the
 * flat price of whichever bracket its headcount falls into — Stripe bills the
 * same via a volume-tiered price (quantity = seats). Above the top bracket,
 * pricing is sales-led (Enterprise / contact us).
 */
export const CORE_TIERS: readonly { upTo: number; cents: number }[] = [
  { upTo: 5, cents: 3900 },
  { upTo: 10, cents: 5900 },
  { upTo: 25, cents: 10900 },
  { upTo: 50, cents: 16900 },
  { upTo: 75, cents: 22900 },
  { upTo: 100, cents: 27900 },
  { upTo: 150, cents: 37900 },
];

/** Largest self-serve team size; beyond it, pricing is sales-led (Enterprise). */
export const CORE_MAX_SEATS = CORE_TIERS[CORE_TIERS.length - 1].upTo;

/** Whether a team of `seats` is past the self-serve ceiling (→ contact sales). */
export function isEnterpriseSeats(seats: number): boolean {
  return Math.max(1, Math.ceil(seats || 0)) > CORE_MAX_SEATS;
}

/**
 * Core platform monthly price (SGD cents) for `seats` employees — the flat price
 * of the bracket the team falls into. Past the top bracket we return the top
 * price (the UI routes such teams to sales, but the number stays sane for any
 * stray value, matching the Stripe price's top volume tier).
 */
export function computeCoreCents(seats: number): number {
  const s = Math.max(1, Math.ceil(seats || 0));
  for (const t of CORE_TIERS) if (s <= t.upTo) return t.cents;
  return CORE_TIERS[CORE_TIERS.length - 1].cents;
}

/** Flat monthly add-on price per optional module (SGD cents). */
export const MODULE_PRICING: Record<OptionalModuleKey, { monthlyCents: number }> = {
  leave: { monthlyCents: 1000 },
  claims: { monthlyCents: 1000 },
  payment_requests: { monthlyCents: 1000 },
  payroll: { monthlyCents: 2000 },
  attendance: { monthlyCents: 1500 },
  timesheets: { monthlyCents: 1500 },
  performance: { monthlyCents: 1200 },
  recruitment: { monthlyCents: 1500 },
  reports: { monthlyCents: 1000 },
};

/** The env var holding a module's Stripe price id (resolved in stripe.ts). */
export function modulePriceEnvKey(key: OptionalModuleKey): string {
  return `STRIPE_PRICE_MODULE_${key.toUpperCase()}`;
}

/** Whether `key` is a real, priceable optional module. */
export function isOptionalModuleKey(key: string): key is OptionalModuleKey {
  return (OPTIONAL_MODULES as string[]).includes(key);
}

/** Human name for a module (reused from the module catalogue). */
export function moduleName(key: OptionalModuleKey): string {
  return MODULE_META[key].name;
}

/**
 * Monthly cost breakdown (SGD cents) for `seats` employees with `modules`
 * enabled: the tiered Core platform fee + the flat price of each enabled
 * optional module.
 */
export function computeBillingCents(
  seats: number,
  modules: readonly string[],
): { baseCents: number; moduleCents: number; totalCents: number } {
  const baseCents = computeCoreCents(seats);
  let moduleCents = 0;
  for (const m of modules) {
    if (isOptionalModuleKey(m)) moduleCents += MODULE_PRICING[m].monthlyCents;
  }
  return { baseCents, moduleCents, totalCents: baseCents + moduleCents };
}

// ─── Enterprise (sales-led, dedicated deployment) ────────────────────────────

/**
 * Marketing descriptor for the Enterprise offering — a custom, sales-led plan
 * where the organisation runs on its OWN dedicated Convex deployment (separate
 * database + keys) on its own domain, with all modules included and dedicated
 * support. Priced by custom quote (billing handled manually), so there is no
 * Stripe product; the CTA routes to the contact form. Shared by the landing
 * pricing section and the in-app plan builder so the copy stays consistent.
 */
export const ENTERPRISE = {
  name: "Enterprise",
  tagline:
    "For large organisations that need a dedicated, single-tenant deployment.",
  features: [
    "Your own dedicated Convex database, keys and infrastructure",
    "Your own domain (e.g. hr.yourcompany.com)",
    "Every module included — no add-ons to pick",
    "Unlimited team size (150+ employees)",
    "SSO-ready single sign-on",
    "Priority support with a dedicated account manager & SLA",
    "Guided onboarding and data migration",
    "Custom quote billed on your terms",
  ],
} as const;

// ─── Legacy tiered plans (pre-existing subscriptions only) ───────────────────

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
