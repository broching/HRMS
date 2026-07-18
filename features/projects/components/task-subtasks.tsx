"use client"

import * as React from "react"
import { useMutation } from "convex/react"
import { IconPlus, IconCheck, IconChevronRight, IconClock } from "@tabler/icons-react"
import { toast } from "sonner"
import { getErrorMessage } from "@/lib/errors"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { formatMinutes } from "@/features/timesheets/lib/time"
import {
  dueMeta,
  dueToneClasses,
  priorityClasses,
  priorityLabel,
  type TaskPriority,
} from "@/features/projects/lib/task"
import { AssigneeAvatars } from "@/features/projects/components/assignee-avatars"

type Subtask = {
  _id: Id<"projectTasks">
  name: string
  status: "open" | "done"
  priority: TaskPriority | null
  dueDate: string | null
  loggedMinutes: number
  assignees: { employeeId: Id<"employees">; name: string }[]
}

/**
 * Subtasks section — real child work items under a task. Assignees can tick them
 * complete; managers can quick-add. Clicking a subtask opens it in the panel.
 */
export function TaskSubtasks({
  parentTaskId,
  projectId,
  subtasks,
  canManage,
  canComplete,
  onOpenSubtask,
}: {
  parentTaskId: Id<"projectTasks">
  projectId: Id<"projects">
  subtasks: Subtask[]
  canManage: boolean
  canComplete: boolean
  onOpenSubtask: (taskId: Id<"projectTasks">) => void
}) {
  const createTask = useMutation(api.projects.createTask)
  const setStatus = useMutation(api.projects.setTaskStatus)
  const [name, setName] = React.useState("")
  const [adding, setAdding] = React.useState(false)

  const done = subtasks.filter((s) => s.status === "done").length
  const total = subtasks.length

  async function add() {
    const n = name.trim()
    if (!n) return
    setAdding(true)
    try {
      await createTask({ projectId, name: n, parentTaskId })
      setName("")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't add the subtask."))
    } finally {
      setAdding(false)
    }
  }

  if (total === 0 && !canManage) return null

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        Subtasks{total > 0 ? ` · ${done}/${total}` : ""}
      </Label>
      {total > 0 && (
        <ul className="divide-y rounded-md border">
          {subtasks.map((s) => {
            const isDone = s.status === "done"
            const due = dueMeta(s.dueDate, s.status)
            return (
              <li key={s._id} className="flex items-center gap-2 px-2.5 py-1.5">
                <button
                  type="button"
                  disabled={!canComplete}
                  onClick={() =>
                    setStatus({
                      taskId: s._id,
                      status: isDone ? "open" : "done",
                    }).catch(() => toast.error("Couldn't update the subtask."))
                  }
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full border",
                    isDone
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-input",
                    !canComplete && "opacity-60",
                  )}
                  aria-label="Toggle subtask"
                >
                  {isDone && <IconCheck className="size-3" />}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenSubtask(s._id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-sm",
                      isDone && "text-muted-foreground line-through",
                    )}
                  >
                    {s.name}
                  </span>
                  {s.priority && (
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-1.5 text-[10px]",
                        priorityClasses(s.priority),
                      )}
                    >
                      {priorityLabel(s.priority)}
                    </span>
                  )}
                  {due && (
                    <span className={cn("shrink-0 text-[11px]", dueToneClasses(due.tone))}>
                      {due.label}
                    </span>
                  )}
                  {s.loggedMinutes > 0 && (
                    <span className="text-muted-foreground flex shrink-0 items-center gap-0.5 text-[11px]">
                      <IconClock className="size-3" />
                      {formatMinutes(s.loggedMinutes)}
                    </span>
                  )}
                  <AssigneeAvatars people={s.assignees} />
                  <IconChevronRight className="text-muted-foreground size-4 shrink-0" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {canManage && (
        <div className="flex items-center gap-2">
          <IconPlus className="text-muted-foreground size-4 shrink-0" />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void add()
              }
            }}
            placeholder="Add a subtask…"
            disabled={adding}
            className="h-8 border-transparent bg-transparent px-1 shadow-none focus-visible:border-input focus-visible:bg-background"
          />
        </div>
      )}
    </div>
  )
}
