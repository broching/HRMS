// Presentation helpers for project tasks: priority labels/colours and due-date
// formatting. Kept framework-agnostic so both the manage side and the personal
// "My Tasks" page render tasks identically.

import { todayIso } from "@/features/timesheets/lib/time"

export type TaskPriority = "low" | "medium" | "high"

export const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
]

// Tailwind classes for a priority pill (light + dark).
export function priorityClasses(p: TaskPriority): string {
  switch (p) {
    case "high":
      return "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
    case "medium":
      return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
    case "low":
      return "border-slate-400/30 bg-slate-400/10 text-slate-600 dark:text-slate-400"
  }
}

export function priorityLabel(p: TaskPriority): string {
  return PRIORITY_OPTIONS.find((o) => o.value === p)?.label ?? p
}

// Human due-date label + whether it's overdue / due soon (for tinting).
export function dueMeta(
  dueDate: string | null | undefined,
  status: "open" | "done",
): { label: string; tone: "overdue" | "soon" | "normal" } | null {
  if (!dueDate) return null
  const today = todayIso()
  const label = formatDue(dueDate)
  if (status === "done") return { label, tone: "normal" }
  if (dueDate < today) return { label, tone: "overdue" }
  // Within the next 2 days counts as "soon".
  const soon = addDays(today, 2)
  if (dueDate <= soon) return { label, tone: "soon" }
  return { label, tone: "normal" }
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
    dt.getDate(),
  ).padStart(2, "0")}`
}

function formatDue(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: dt.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  })
}

export function dueToneClasses(tone: "overdue" | "soon" | "normal"): string {
  switch (tone) {
    case "overdue":
      return "text-red-600 dark:text-red-400"
    case "soon":
      return "text-amber-600 dark:text-amber-400"
    case "normal":
      return "text-muted-foreground"
  }
}
