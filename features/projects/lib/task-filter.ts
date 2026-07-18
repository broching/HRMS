// Client-side task filtering shared by the Board and List views. Operates on the
// already-loaded board data (BoardTask), so filtering is instant and needs no
// extra round-trips. The filter state is JSON-serialisable so it can be stored as
// a saved view.

import type { BoardTask } from "@/features/projects/components/task-card"
import { dueMeta } from "@/features/projects/lib/task"
import type { Id } from "@/convex/_generated/dataModel"

export type DueFilter = "overdue" | "soon" | "none"

export type TaskFilter = {
  assigneeId: Id<"employees"> | null
  labelIds: Id<"taskLabels">[]
  priority: ("low" | "medium" | "high")[]
  due: DueFilter | null
  status: "open" | "done" | null
  // Custom field values: key → the required value (string for select, "true" for
  // checkbox). A present key means "must equal".
  customFields: Record<string, string>
}

export function emptyFilter(): TaskFilter {
  return {
    assigneeId: null,
    labelIds: [],
    priority: [],
    due: null,
    status: null,
    customFields: {},
  }
}

export function filterCount(f: TaskFilter): number {
  let n = 0
  if (f.assigneeId) n++
  n += f.labelIds.length
  n += f.priority.length
  if (f.due) n++
  if (f.status) n++
  n += Object.keys(f.customFields).length
  return n
}

export function isFilterActive(f: TaskFilter): boolean {
  return filterCount(f) > 0
}

// Does a board task satisfy the filter? Custom fields aren't on the card view, so
// a `customFields` matcher is passed a value lookup by taskId (or ignored when
// none is supplied).
export function taskMatches(
  task: BoardTask,
  f: TaskFilter,
  customFieldsFor?: (taskId: Id<"projectTasks">) => Record<string, unknown> | undefined,
): boolean {
  if (f.status && task.status !== f.status) return false
  if (f.priority.length && (!task.priority || !f.priority.includes(task.priority as "low" | "medium" | "high")))
    return false
  if (f.assigneeId && !task.assignees.some((a) => a.employeeId === f.assigneeId))
    return false
  if (f.labelIds.length) {
    const have = new Set(task.labels.map((l) => l._id))
    if (!f.labelIds.some((id) => have.has(id))) return false
  }
  if (f.due) {
    if (f.due === "none") {
      if (task.dueDate) return false
    } else {
      const meta = dueMeta(task.dueDate, task.status)
      if (!meta) return false
      if (f.due === "overdue" && meta.tone !== "overdue") return false
      if (f.due === "soon" && meta.tone !== "soon") return false
    }
  }
  const cfKeys = Object.keys(f.customFields)
  if (cfKeys.length) {
    const values = customFieldsFor?.(task._id) ?? {}
    for (const key of cfKeys) {
      const want = f.customFields[key]
      const got = values[key]
      if (want === "true") {
        if (got !== true) return false
      } else if (String(got ?? "") !== want) {
        return false
      }
    }
  }
  return true
}
