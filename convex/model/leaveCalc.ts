/**
 * Pure leave-day math. No Convex imports — unit-testable.
 * Dates are ISO "YYYY-MM-DD" strings handled in UTC to avoid TZ drift.
 */

export function eachDateISO(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function isWeekendISO(
  dateISO: string,
  weekendDays: number[] = [0, 6],
): boolean {
  const day = new Date(`${dateISO}T00:00:00Z`).getUTCDay();
  return weekendDays.includes(day);
}

/**
 * Number of leave days between two dates inclusive, excluding weekends and
 * holidays, accounting for half-day starts/ends.
 */
export function countLeaveDays(params: {
  startDate: string;
  endDate: string;
  startHalf?: "am" | "pm";
  endHalf?: "am" | "pm";
  holidays: Set<string>;
  weekendDays?: number[];
}): number {
  const weekendDays = params.weekendDays ?? [0, 6];
  const { startDate, endDate, startHalf, endHalf, holidays } = params;

  const working = eachDateISO(startDate, endDate).filter(
    (d) => !isWeekendISO(d, weekendDays) && !holidays.has(d),
  );
  let total = working.length;
  if (total === 0) return 0;

  if (startDate === endDate) {
    return startHalf ? 0.5 : total;
  }
  const startWorking =
    !isWeekendISO(startDate, weekendDays) && !holidays.has(startDate);
  const endWorking =
    !isWeekendISO(endDate, weekendDays) && !holidays.has(endDate);
  if (startHalf && startWorking) total -= 0.5;
  if (endHalf && endWorking) total -= 0.5;
  return total;
}
