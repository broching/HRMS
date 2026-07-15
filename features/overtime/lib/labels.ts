import type { OvertimeStatus } from "@/convex/lib/enums"

export const OVERTIME_STATUS_LABELS: Record<OvertimeStatus, string> = {
  scheduled: "Scheduled",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
}

// Tailwind classes for a status pill, light/dark aware.
export const OVERTIME_STATUS_CLASSES: Record<OvertimeStatus, string> = {
  scheduled:
    "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  approved:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  rejected: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
  cancelled: "bg-muted text-muted-foreground",
}

export function formatOvertimeDate(iso: string): string {
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
}
