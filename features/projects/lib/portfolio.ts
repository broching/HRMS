// Presentation helpers for the project portfolio (dashboard + project-level
// Kanban): phase labels/tones and small filter/sort utilities. Framework-free.

export type ProjectPhase = "planning" | "active" | "on_hold" | "completed"

export const PHASE_ORDER: ProjectPhase[] = [
  "planning",
  "active",
  "on_hold",
  "completed",
]

type PhaseMeta = {
  label: string
  // A hex for the column accent + a soft badge class pair.
  dot: string
  badge: string
}

export const PHASE_META: Record<ProjectPhase, PhaseMeta> = {
  planning: {
    label: "Planning",
    dot: "#6366f1",
    badge: "border-indigo-500/25 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
  },
  active: {
    label: "In progress",
    dot: "#3b82f6",
    badge: "border-blue-500/25 bg-blue-500/10 text-blue-600 dark:text-blue-300",
  },
  on_hold: {
    label: "On hold",
    dot: "#f59e0b",
    badge: "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  },
  completed: {
    label: "Completed",
    dot: "#22c55e",
    badge: "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  },
}

export function phaseLabel(phase: ProjectPhase): string {
  return PHASE_META[phase].label
}

export type SortKey = "recent" | "name" | "hours" | "progress"

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "Recently updated" },
  { value: "name", label: "Name" },
  { value: "hours", label: "Most hours" },
  { value: "progress", label: "Progress" },
]

export function completionPct(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0
}
