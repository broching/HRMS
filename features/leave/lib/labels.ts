import type { LeaveStatus } from "@/convex/lib/enums"

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  info_requested: "Info requested",
}

export const LEAVE_STATUS_BADGE: Record<
  LeaveStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
  cancelled: "outline",
  info_requested: "secondary",
}

// "22 Jun – 23 Jun" + weekday line "Wed – Thu" (BrioHR-style history row).
export function formatLeaveDates(
  startDate: string,
  endDate: string,
): { range: string; weekdays: string } {
  const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => {
    const d = new Date(`${iso}T00:00:00`)
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, opts)
  }
  const day = (iso: string) => fmt(iso, { day: "numeric", month: "short" })
  const wd = (iso: string) => fmt(iso, { weekday: "short" })
  if (startDate === endDate) {
    return { range: day(startDate), weekdays: wd(startDate) }
  }
  return {
    range: `${day(startDate)} – ${day(endDate)}`,
    weekdays: `${wd(startDate)} – ${wd(endDate)}`,
  }
}

export function formatLeaveRange(
  startDate: string,
  endDate: string,
  startHalf?: "am" | "pm",
  endHalf?: "am" | "pm",
): string {
  const half = (h?: "am" | "pm") =>
    h === "am" ? " (AM)" : h === "pm" ? " (PM)" : ""
  if (startDate === endDate) return `${startDate}${half(startHalf)}`
  return `${startDate}${half(startHalf)} → ${endDate}${half(endHalf)}`
}
