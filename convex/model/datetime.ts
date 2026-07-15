/**
 * Timezone-aware date helpers. Attendance days are bucketed by the office's
 * local calendar date, not UTC, so a late-night shift lands on the right day.
 */

/** ISO "YYYY-MM-DD" for an epoch-ms instant in the given IANA timezone. */
export function localDateISO(ms: number, timeZone: string): string {
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

/** Minute-of-day (0–1439) for an epoch-ms instant in the given IANA timezone. */
export function localMinuteOfDay(ms: number, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(ms));
    const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    // Intl can emit "24" for midnight in some runtimes — normalize to 0.
    return ((h % 24) * 60 + m) % 1440;
  } catch {
    const d = new Date(ms);
    return d.getHours() * 60 + d.getMinutes();
  }
}
