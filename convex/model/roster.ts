/**
 * Pure roster helpers — no `ctx`, unit-testable. Bridges the weekly work
 * pattern, concrete shift assignments, and actual attendance so the unified
 * roster board can derive virtual shifts and schedule-vs-actual variance.
 */

import { parseHHMM, shiftDurationMinutes } from "./shiftTime";

export type PatternDay = {
  off: boolean;
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
};

export type WorkPatternLike = {
  days: PatternDay[];
  color?: string;
  officeId?: unknown;
};

export type DerivedShift = {
  startTime: string;
  endTime: string;
  breakMinutes: number;
  durationMinutes: number;
};

/** Inclusive list of ISO "YYYY-MM-DD" dates from `start` to `end`. */
export function datesInRange(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = new Date(`${start}T00:00:00Z`).getTime();
  const last = new Date(`${end}T00:00:00Z`).getTime();
  while (cur <= last) {
    out.push(new Date(cur).toISOString().slice(0, 10));
    cur += 86_400_000;
  }
  return out;
}

/** Minutes-of-day for a shift's "HH:MM" window, clamped to the 0–1440 grid. */
export function shiftWindowMinutes(
  startTime: string,
  endTime: string,
): { startMinute: number; endMinute: number } {
  const s = parseHHMM(startTime) ?? 0;
  let e = parseHHMM(endTime) ?? 0;
  if (e <= s) e = 24 * 60; // overnight — clamp to end of the visible day
  return { startMinute: s, endMinute: e };
}

/** Weekday index for an ISO "YYYY-MM-DD" date, Monday-first: 0 = Mon … 6 = Sun. */
export function weekdayIndexMon0(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sun … 6 = Sat
  return (day + 6) % 7;
}

/**
 * The shift a work pattern implies for a given date, or null when the pattern
 * marks that weekday off / has no valid times. Times are wall-clock "HH:MM".
 */
export function deriveVirtualShift(
  pattern: WorkPatternLike,
  date: string,
): DerivedShift | null {
  const day = pattern.days[weekdayIndexMon0(date)];
  if (!day || day.off) return null;
  const { startTime, endTime } = day;
  if (!startTime || !endTime) return null;
  if (parseHHMM(startTime) === null || parseHHMM(endTime) === null) return null;
  const breakMinutes = day.breakMinutes ?? 0;
  return {
    startTime,
    endTime,
    breakMinutes,
    durationMinutes: shiftDurationMinutes(startTime, endTime, breakMinutes),
  };
}

export type Variance = {
  lateStartMin: number;
  earlyLeaveMin: number;
  absent: boolean;
  unscheduled: boolean;
  workedBeyondEndMin: number;
};

export const NO_VARIANCE: Variance = {
  lateStartMin: 0,
  earlyLeaveMin: 0,
  absent: false,
  unscheduled: false,
  workedBeyondEndMin: 0,
};

// Minutes past the scheduled end before we surface an OT suggestion.
export const OT_SUGGESTION_THRESHOLD_MIN = 30;

/**
 * Compare a scheduled window (minute-of-day) against actual clocked sessions.
 * `scheduled` is null when nothing was rostered; `actual` sessions use `null`
 * end for an ongoing (still clocked-in) session, resolved to `nowMinute`.
 */
export function computeVariance(
  scheduled: { startMinute: number; endMinute: number } | null,
  actual: { startMinute: number; endMinute: number | null }[],
  nowMinute: number,
): Variance {
  const hasActual = actual.length > 0;
  if (!scheduled) {
    return { ...NO_VARIANCE, unscheduled: hasActual };
  }
  if (!hasActual) {
    return { ...NO_VARIANCE, absent: true };
  }
  const actualStart = Math.min(...actual.map((a) => a.startMinute));
  const actualEnd = Math.max(
    ...actual.map((a) => a.endMinute ?? nowMinute),
  );
  return {
    lateStartMin: Math.max(0, actualStart - scheduled.startMinute),
    earlyLeaveMin: Math.max(0, scheduled.endMinute - actualEnd),
    absent: false,
    unscheduled: false,
    workedBeyondEndMin: Math.max(0, actualEnd - scheduled.endMinute),
  };
}

/** Minute-of-day (0–1439) → "HH:MM". */
export function minuteToHHMM(min: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(min)));
  const h = Math.floor(clamped / 60) % 24;
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * When actual work ran past the scheduled end by at least the threshold, the
 * suggested OT window (scheduled end → actual end) for a manager to confirm.
 */
export function otSuggestionFrom(
  scheduledEndMinute: number,
  actualEndMinute: number,
): { startTime: string; endTime: string; hours: number } | null {
  const beyond = actualEndMinute - scheduledEndMinute;
  if (beyond < OT_SUGGESTION_THRESHOLD_MIN) return null;
  return {
    startTime: minuteToHHMM(scheduledEndMinute),
    endTime: minuteToHHMM(actualEndMinute),
    hours: Math.round((beyond / 60) * 100) / 100,
  };
}

/** Planned OT hours implied by a start/end window, rounded to 2 dp. */
export function hoursBetween(startTime: string, endTime: string): number | null {
  const start = parseHHMM(startTime);
  const end = parseHHMM(endTime);
  if (start === null || end === null) return null;
  let span = end - start;
  if (span <= 0) span += 24 * 60; // overnight
  return Math.round((span / 60) * 100) / 100;
}
