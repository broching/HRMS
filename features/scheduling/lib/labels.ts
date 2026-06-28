import type { ShiftStatus } from "@/convex/lib/enums"

export const SHIFT_STATUS_LABELS: Record<ShiftStatus, string> = {
  draft: "Draft",
  published: "Published",
  cancelled: "Cancelled",
}

export const SHIFT_STATUS_BADGE: Record<
  ShiftStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  draft: "secondary",
  published: "default",
  cancelled: "outline",
}

/** "7h 30m" / "45m" from a minute count. */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

// A few preset colors for templates / ad-hoc shifts.
export const SHIFT_COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#0ea5e9",
  "#8b5cf6",
  "#ec4899",
  "#64748b",
]
