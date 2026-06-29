import type { Doc } from "../_generated/dataModel";

/**
 * Pure, V8-safe leave-policy engine. No ctx, no DB — just deterministic math so
 * entitlement can be *computed on read* instead of credited by a scheduled job
 * (see the design note in the plan). Given a policy + the employee's join date,
 * `computeEntitlement` returns how many days are entitled for a year as of a
 * date, accounting for fixed/earned entitlement, proration, seniority and
 * rounding.
 *
 * All dates are ISO "YYYY-MM-DD" strings, interpreted in UTC to stay
 * timezone-stable (a leave day is a calendar day, not an instant).
 */

export type LeavePolicy = Doc<"leavePolicies">;

// ─── Date helpers (UTC, calendar-day granularity) ──────────────────────────

function parse(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m: m || 1, d: d || 1 };
}

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInYear(y: number): number {
  return isLeap(y) ? 366 : 365;
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function daysInMonth(y: number, m: number): number {
  if (m === 2 && isLeap(y)) return 29;
  return MONTH_DAYS[m - 1] ?? 30;
}

/** Inclusive whole-day count between two ISO dates (a→b, ≥0). */
export function inclusiveDays(aIso: string, bIso: string): number {
  const a = parse(aIso);
  const b = parse(bIso);
  const ms = Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d);
  return Math.floor(ms / 86_400_000) + 1;
}

/** Completed months from a→b (e.g. Jan 10 → Mar 9 = 1; → Mar 10 = 2). */
export function completedMonths(aIso: string, bIso: string): number {
  const a = parse(aIso);
  const b = parse(bIso);
  let months = (b.y - a.y) * 12 + (b.m - a.m);
  if (b.d < a.d) months -= 1;
  return Math.max(0, months);
}

/** Whole years of service from join date to a reference date. */
export function yearsOfService(joinIso: string, asOfIso: string): number {
  return Math.floor(completedMonths(joinIso, asOfIso) / 12);
}

// ─── Engine pieces ─────────────────────────────────────────────────────────

/**
 * Fraction (0..1) of the calendar `year` the employee is entitled to, given a
 * mid-year join. Returns 1 for a full year, 0 if they hadn't joined yet.
 */
export function prorationFactor(
  policy: LeavePolicy,
  joinIso: string,
  year: number,
): number {
  if (!policy.proratedEnabled) return 1;
  const join = parse(joinIso);
  if (join.y > year) return 0; // not yet joined
  if (join.y < year) return 1; // joined in a prior year → full year
  const mode = policy.prorateMode ?? "started";
  const jm = join.m; // 1..12
  if (mode === "started") {
    // Count the join month in full.
    return (13 - jm) / 12;
  }
  if (mode === "completed") {
    // Exclude the join month.
    return (12 - jm) / 12;
  }
  // partial: prorate the join month by days worked, then add full later months.
  const dim = daysInMonth(year, jm);
  const workedInMonth = dim - join.d + 1;
  const monthFrac = workedInMonth / dim;
  const fullMonthsAfter = 12 - jm;
  return Math.min(1, Math.max(0, (monthFrac + fullMonthsAfter) / 12));
}

/** Extra days from seniority rules given years of service. Capped if set. */
export function seniorityDays(policy: LeavePolicy, yos: number): number {
  if (!policy.seniorityEnabled) return 0;
  const rules = policy.seniorityRules ?? [];
  if (rules.length === 0) return 0;
  let days = 0;
  if ((policy.seniorityIncrementMode ?? "fixed") === "fixed") {
    // Recurring: the first rule defines "+addDays every afterYears of service".
    const r = rules[0];
    const interval = r.afterYears > 0 ? r.afterYears : 1;
    days = Math.floor(yos / interval) * r.addDays;
  } else {
    // Variable: cumulative — every tier the employee has passed adds its days.
    for (const r of rules) if (yos >= r.afterYears) days += r.addDays;
  }
  if (policy.seniorityMaxDays != null) days = Math.min(days, policy.seniorityMaxDays);
  return days;
}

export function applyRounding(
  mode: LeavePolicy["rounding"],
  value: number,
): number {
  switch (mode) {
    case "up":
      return Math.ceil(value);
    case "down":
      return Math.floor(value);
    case "nearest_half":
      return Math.round(value * 2) / 2;
    default:
      // Keep two decimals to avoid float noise (e.g. 11.6666 → 11.67).
      return Math.round(value * 100) / 100;
  }
}

/**
 * Fraction (0..1) of the year's entitlement that has *vested* as of a date,
 * for earned (accrual) leave. Accrues linearly over the period the employee is
 * active that year (from max(join, Jan 1) to Dec 31). 1 when not earned.
 */
export function vestedFraction(
  policy: LeavePolicy,
  joinIso: string,
  year: number,
  asOfIso: string,
): number {
  if (!policy.earnedEnabled) return 1;
  const join = parse(joinIso);
  const startIso =
    join.y === year ? joinIso : join.y < year ? `${year}-01-01` : null;
  if (!startIso) return 0; // not joined yet this year
  const endIso = `${year}-12-31`;
  // Clamp asOf into the active window.
  let asOf = asOfIso;
  if (asOf < startIso) return 0;
  if (asOf > endIso) asOf = endIso;
  if ((policy.accrualType ?? "monthly") === "monthly") {
    const total = completedMonths(startIso, endIso) || 1;
    // +1 so the first month vests at month end of the join month onward.
    const elapsed = completedMonths(startIso, asOf) + 1;
    return Math.min(1, elapsed / (total + 1));
  }
  const total = inclusiveDays(startIso, endIso);
  const elapsed = inclusiveDays(startIso, asOf);
  return Math.min(1, elapsed / total);
}

/**
 * Days entitled under this policy for `year`, as of `asOfIso`. `upon_request`
 * policies are untracked (return 0 — availability is enforced as "always").
 */
export function computeEntitlement(
  policy: LeavePolicy,
  joinIso: string,
  year: number,
  asOfIso: string,
): number {
  if (policy.entitlementMode === "upon_request") return 0;

  // Seniority is measured at the start of the reference period, or on the
  // employee's anniversary within the year.
  const refIso =
    (policy.seniorityEffective ?? "period") === "anniversary"
      ? asOfIso
      : `${year}-01-01`;
  const yos = yearsOfService(joinIso, refIso);

  const annual =
    (policy.entitlementDays + seniorityDays(policy, yos)) *
    prorationFactor(policy, joinIso, year);

  const vested = annual * vestedFraction(policy, joinIso, year, asOfIso);
  return applyRounding(policy.rounding, vested);
}
