import type { LeaveStatus } from "@/convex/lib/enums"

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
}

export const LEAVE_STATUS_BADGE: Record<
  LeaveStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  pending: "secondary",
  approved: "default",
  rejected: "destructive",
  cancelled: "outline",
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
