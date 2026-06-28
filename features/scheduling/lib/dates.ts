/** Local-date helpers for the weekly roster (Monday-based weeks). */

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`
}

export function addDays(d: Date, n: number): Date {
  const next = new Date(d)
  next.setDate(next.getDate() + n)
  return next
}

/** Monday 00:00 of the week containing `d`. */
export function mondayOf(d: Date): Date {
  const day = d.getDay() // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff)
  return monday
}

/** The seven Date objects of the week starting at `monday`. */
export function weekDates(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

export function shortDay(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "short" })
}

export function dayNum(d: Date): string {
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" })
}

export function isSameDay(a: Date, b: Date): boolean {
  return isoDate(a) === isoDate(b)
}
