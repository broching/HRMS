"use client"

import type { FunctionReturnType } from "convex/server"
import { IconPaperclip, IconClock } from "@tabler/icons-react"
import type { api } from "@/convex/_generated/api"
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

export type BoardTask = FunctionReturnType<typeof api.projects.board>["tasks"][number]

// A Kanban / list task card. Presentational — dragging is wired by the board.
export function TaskCard({
  task,
  onClick,
  dragging,
}: {
  task: BoardTask
  onClick?: () => void
  dragging?: boolean
}) {
  const done = task.status === "done"
  const due = dueMeta(task.dueDate, task.status)
  const est = task.estimateMinutes ?? 0
  const logged = task.loggedMinutes
  const pct = est > 0 ? Math.min(100, Math.round((logged / est) * 100)) : 0
  const over = est > 0 && logged > est

  return (
    <div
      role={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "bg-background flex flex-col gap-2 rounded-lg border p-3 text-left shadow-sm transition",
        onClick && "hover:border-primary/40 cursor-pointer",
        dragging && "ring-primary/40 rotate-1 opacity-80 shadow-lg ring-2",
      )}
    >
      <p
        className={cn(
          "line-clamp-3 text-sm font-medium",
          done && "text-muted-foreground line-through",
        )}
      >
        {task.name}
      </p>

      {(task.priority || due) && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {task.priority && (
            <span
              className={cn(
                "rounded-full border px-1.5",
                priorityClasses(task.priority as TaskPriority),
              )}
            >
              {priorityLabel(task.priority as TaskPriority)}
            </span>
          )}
          {due && (
            <span className={cn("flex items-center gap-0.5", dueToneClasses(due.tone))}>
              {due.label}
              {due.tone === "overdue" && !done && " · overdue"}
            </span>
          )}
        </div>
      )}

      {/* Logged vs estimate */}
      {(est > 0 || logged > 0) && (
        <div className="flex flex-col gap-1">
          <div className="text-muted-foreground flex items-center justify-between text-[11px] tabular-nums">
            <span className="flex items-center gap-1">
              <IconClock className="size-3" />
              {formatMinutes(logged)}
            </span>
            {est > 0 && (
              <span className={cn(over && "text-red-600 dark:text-red-400")}>
                / {formatMinutes(est)}
              </span>
            )}
          </div>
          {est > 0 && (
            <div className="bg-muted h-1 overflow-hidden rounded-full">
              <div
                className={cn("h-full rounded-full", over ? "bg-red-500" : "bg-primary")}
                style={{ width: `${over ? 100 : pct}%` }}
              />
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <AssigneeAvatars people={task.assignees} />
        {task.attachmentCount > 0 && (
          <span className="text-muted-foreground flex items-center gap-0.5 text-[11px]">
            <IconPaperclip className="size-3" />
            {task.attachmentCount}
          </span>
        )}
      </div>
    </div>
  )
}
