import type { LeaveStatus } from "@/convex/lib/enums"

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  info_requested: "Info requested",
}

// Tailwind utility classes for a status badge.
export const LEAVE_STATUS_BADGE: Record<LeaveStatus, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  approved:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  rejected: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  cancelled: "bg-muted text-muted-foreground",
  info_requested: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
}

export const APPROVER_MODE_LABELS: Record<string, string> = {
  manager: "Manager",
  department_head: "Department head",
  specific: "Specific person",
  none: "None",
}

export const ENTITLEMENT_MODE_LABELS: Record<string, string> = {
  fixed: "Fixed entitlement",
  upon_request: "Upon request",
}

export const ACCRUAL_TYPE_LABELS: Record<string, string> = {
  daily: "Daily basis",
  monthly: "Monthly basis",
}

export const PRORATE_MODE_LABELS: Record<string, string> = {
  started: "Started month",
  completed: "Completed month",
  partial: "Partial month",
}

export const ROUNDING_LABELS: Record<string, string> = {
  none: "None",
  up: "Round up",
  down: "Round down",
  nearest_half: "Nearest half day",
}

// Human-readable copy for a timeline event type.
export function timelineLabel(type: string): string {
  switch (type) {
    case "created":
      return "Leave requested"
    case "approved_step1":
      return "Approved (1st approver)"
    case "approved":
      return "Approved"
    case "rejected":
      return "Rejected"
    case "info_requested":
      return "More info requested"
    case "cancelled":
      return "Cancelled"
    case "modified":
      return "Modified"
    case "employee_responded":
      return "Employee responded & resubmitted"
    default:
      return type
  }
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

/** "2026-08-25" → "Aug 25, 2026". */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-")
  return `${MONTHS[Number(m) - 1] ?? m} ${Number(d)}, ${y}`
}

/** Compact "25 Aug – 27 Aug" range (same year omitted on the start). */
export function formatRange(start: string, end: string): string {
  const fmt = (iso: string) => {
    const [, m, d] = iso.split("-")
    return `${Number(d)} ${MONTHS[Number(m) - 1] ?? m}`
  }
  return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`
}

/** Relative time like "5 minutes ago" for timeline rows. */
export function relativeTime(ms: number): string {
  const diff = Date.now() - ms
  const min = Math.floor(diff / 60000)
  if (min < 1) return "just now"
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}
