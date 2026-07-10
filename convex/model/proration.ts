/**
 * Prorated-pay math — Singapore MOM incomplete-month formula. No Convex
 * imports, so it is pure and unit-testable. Dates are ISO "YYYY-MM-DD" handled
 * in UTC to avoid timezone drift.
 *
 * Formula: pay = baseMonthly ÷ (total working days in month) × (days worked).
 * Working days = the employee's working weekdays in the month, minus public
 * holidays (holidays are non-working). Days worked = working days inside the
 * employment window that are not unpaid-leave days.
 */

// Default working weekdays: Mon–Fri (1..5). Sunday = 0, Saturday = 6.
export const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];

// Every calendar date in a "YYYY-MM" period, as ISO "YYYY-MM-DD".
export function datesInMonth(periodMonth: string): string[] {
  const [y, m] = periodMonth.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const out: string[] = [];
  for (let d = 1; d <= last; d++) {
    out.push(`${periodMonth}-${String(d).padStart(2, "0")}`);
  }
  return out;
}

// Whether a date is a working day for the given weekday set, excluding holidays.
export function isWorkingDay(
  dateISO: string,
  workingDays: number[],
  holidays: Set<string>,
): boolean {
  const dow = new Date(`${dateISO}T00:00:00Z`).getUTCDay();
  return workingDays.includes(dow) && !holidays.has(dateISO);
}

/**
 * Total working days in the month (the proration denominator) and how many of
 * those fall inside the employment window (before unpaid-leave is subtracted).
 */
export function workingDaysInMonth(params: {
  periodMonth: string;
  workingDays: number[];
  holidays: Set<string>;
  employmentStart?: string;
  employmentEnd?: string;
}): { total: number; withinEmployment: number } {
  const {
    periodMonth,
    workingDays,
    holidays,
    employmentStart,
    employmentEnd,
  } = params;
  let total = 0;
  let withinEmployment = 0;
  for (const d of datesInMonth(periodMonth)) {
    if (!isWorkingDay(d, workingDays, holidays)) continue;
    total += 1;
    if (employmentStart && d < employmentStart) continue;
    if (employmentEnd && d > employmentEnd) continue;
    withinEmployment += 1;
  }
  return { total, withinEmployment };
}

/**
 * How many of an employee's working days in [start, end] (inclusive) are unpaid
 * — used to reduce days worked. Counts each working day at most once even if
 * multiple requests overlap (caller passes the union via repeated calls +
 * a shared Set is not needed here; callers accumulate distinct dates).
 */
export function workingDaysBetween(params: {
  start: string;
  end: string;
  periodMonth: string;
  workingDays: number[];
  holidays: Set<string>;
}): string[] {
  const { start, end, periodMonth, workingDays, holidays } = params;
  const monthStart = `${periodMonth}-01`;
  const monthEnd = datesInMonth(periodMonth).slice(-1)[0];
  const lo = start < monthStart ? monthStart : start;
  const hi = end > monthEnd ? monthEnd : end;
  const out: string[] = [];
  const s = new Date(`${lo}T00:00:00Z`);
  const e = new Date(`${hi}T00:00:00Z`);
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (isWorkingDay(iso, workingDays, holidays)) out.push(iso);
  }
  return out;
}

/** Prorated base pay = base × daysWorked / totalWorkingDays (guarded). */
export function proratedBaseCents(
  baseCents: number,
  totalWorkingDays: number,
  daysWorked: number,
): number {
  if (totalWorkingDays <= 0) return baseCents;
  if (daysWorked >= totalWorkingDays) return baseCents;
  if (daysWorked <= 0) return 0;
  return Math.round((baseCents * daysWorked) / totalWorkingDays);
}
