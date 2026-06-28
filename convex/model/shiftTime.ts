/**
 * Pure shift-time helpers — no `ctx`, unit-testable.
 */

/** Minutes since midnight for a "HH:MM" string, or null if malformed. */
export function parseHHMM(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Worked minutes for a shift, subtracting the break. When `end <= start` the
 * shift is treated as crossing midnight (e.g. 22:00 → 06:00).
 */
export function shiftDurationMinutes(
  startTime: string,
  endTime: string,
  breakMinutes: number,
): number {
  const start = parseHHMM(startTime);
  const end = parseHHMM(endTime);
  if (start === null || end === null) return 0;
  let span = end - start;
  if (span <= 0) span += 24 * 60; // overnight
  return Math.max(0, span - Math.max(0, breakMinutes));
}
