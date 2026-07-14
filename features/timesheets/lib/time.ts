// Timesheet time helpers. Durations are stored as whole minutes; the UI works in
// hours. Dates are local ISO "YYYY-MM-DD" strings (no timezone drift). A block
// may also carry a `startMinute` (minute-of-day) to sit on the hourly grid.

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`
}

export function todayIso(): string {
  return isoDate(new Date())
}

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/** Monday of the week containing `d`, as an ISO date. */
export function mondayOf(d: Date): string {
  const x = new Date(d)
  const dow = (x.getDay() + 6) % 7 // 0 = Monday
  x.setDate(x.getDate() - dow)
  return isoDate(x)
}

export function mondayOfIso(iso: string): string {
  return mondayOf(parseIso(iso))
}

export function addDaysIso(iso: string, n: number): string {
  const d = parseIso(iso)
  d.setDate(d.getDate() + n)
  return isoDate(d)
}

export function addMonthsIso(iso: string, n: number): string {
  const d = parseIso(iso)
  d.setMonth(d.getMonth() + n)
  return isoDate(d)
}

/** The 7 ISO dates of the week starting at `mondayIso`. */
export function weekDates(mondayIso: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysIso(mondayIso, i))
}

/** First and last ISO date of the calendar month containing `iso`. */
export function monthRange(iso: string): { from: string; to: string } {
  const d = parseIso(iso)
  const from = isoDate(new Date(d.getFullYear(), d.getMonth(), 1))
  const to = isoDate(new Date(d.getFullYear(), d.getMonth() + 1, 0))
  return { from, to }
}

/**
 * Weeks (Monday-start) covering the whole calendar month of `iso`, including the
 * leading/trailing days needed to fill the first and last rows.
 */
export function monthGrid(iso: string): string[][] {
  const { from, to } = monthRange(iso)
  const start = mondayOfIso(from)
  const weeks: string[][] = []
  let cursor = start
  // At most 6 rows; stop once we've passed the month end and completed a week.
  for (let w = 0; w < 6; w++) {
    const days = weekDates(cursor)
    weeks.push(days)
    cursor = addDaysIso(cursor, 7)
    if (days[6] >= to) break
  }
  return weeks
}

export function sameMonth(iso: string, refIso: string): boolean {
  const a = parseIso(iso)
  const b = parseIso(refIso)
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

export function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}

/** Compact decimal hours, e.g. 90 → "1.5h", 60 → "1h". */
export function formatHoursDecimal(mins: number): string {
  const h = mins / 60
  const rounded = Math.round(h * 100) / 100
  return `${rounded}h`
}

export function hoursToMinutes(hours: number): number {
  return Math.max(0, Math.round(hours * 60))
}

export function minutesToHours(mins: number): number {
  return Math.round((mins / 60) * 100) / 100
}

/** Minute-of-day → "HH:MM" (24h, for <input type=time>). */
export function minutesToClock(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/** "HH:MM" → minute-of-day, or null if empty/invalid. */
export function clockToMinutes(clock: string): number | null {
  if (!clock) return null
  const [h, m] = clock.split(":").map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

/** Minute-of-day → friendly "9:00 AM". */
export function formatClock(mins: number): string {
  const h24 = Math.floor(mins / 60)
  const m = mins % 60
  const ampm = h24 < 12 ? "AM" : "PM"
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`
}

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
export const DOW_LABELS = DOW

/** e.g. "Mon 14 Jul" for an ISO date. */
export function formatDayLabel(iso: string): string {
  const d = parseIso(iso)
  const dow = DOW[(d.getDay() + 6) % 7]
  return `${dow} ${d.getDate()} ${d.toLocaleDateString(undefined, { month: "short" })}`
}

/** Day-of-week short name for an ISO date, e.g. "Mon". */
export function dowLabel(iso: string): string {
  const d = parseIso(iso)
  return DOW[(d.getDay() + 6) % 7]
}

export function dayOfMonth(iso: string): number {
  return parseIso(iso).getDate()
}

export function weekRangeLabel(mondayIso: string): string {
  const start = parseIso(mondayIso)
  const end = parseIso(addDaysIso(mondayIso, 6))
  const sameMonthRange = start.getMonth() === end.getMonth()
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }
  const s = start.toLocaleDateString(undefined, sameMonthRange ? { day: "numeric" } : opts)
  const e = end.toLocaleDateString(undefined, opts)
  return `${s} – ${e} ${end.getFullYear()}`
}

export function monthLabel(iso: string): string {
  return parseIso(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" })
}

// ── Hourly grid geometry ─────────────────────────────────────────────────────
// A default working window; the grid expands to include any entry outside it.
export const DEFAULT_START_HOUR = 7
export const DEFAULT_END_HOUR = 20 // exclusive-ish; last visible hour label
export const HOUR_HEIGHT = 52 // px per hour row
export const PX_PER_MIN = HOUR_HEIGHT / 60

/** Visible [startHour, endHour] covering the day window plus any entries. */
export function gridBounds(
  starts: { startMinute: number; minutes: number }[],
): { startHour: number; endHour: number } {
  let startHour = DEFAULT_START_HOUR
  let endHour = DEFAULT_END_HOUR
  for (const e of starts) {
    const sH = Math.floor(e.startMinute / 60)
    const eH = Math.ceil((e.startMinute + e.minutes) / 60)
    if (sH < startHour) startHour = sH
    if (eH > endHour) endHour = eH
  }
  return { startHour: Math.max(0, startHour), endHour: Math.min(24, endHour) }
}
