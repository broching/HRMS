import type { AttendanceStatus } from "@/convex/lib/enums"

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  open: "Clocked in",
  completed: "Completed",
}

export const ATTENDANCE_STATUS_BADGE: Record<
  AttendanceStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  open: "default",
  completed: "secondary",
}

/** "9:04 AM" in the viewer's locale from an epoch-ms instant. */
export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
}

/** "Mon, 12 Aug" from an epoch-ms instant. */
export function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
}

/** "7h 32m" from a minute count. */
export function formatDuration(minutes: number | null): string {
  if (minutes == null) return "—"
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}

/** Live elapsed string since clock-in. */
export function elapsedSince(ms: number, now: number): string {
  return formatDuration(Math.max(0, Math.round((now - ms) / 60000)))
}
