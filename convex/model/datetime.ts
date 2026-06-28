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
