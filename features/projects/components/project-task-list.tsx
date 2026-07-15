"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import {
  IconCheck,
  IconChevronRight,
  IconPaperclip,
  IconUsers,
  IconClock,
  IconPlus,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { formatMinutes } from "@/features/timesheets/lib/time"
import {
  dueMeta,
  dueToneClasses,
  priorityClasses,
  priorityLabel,
  type TaskPriority,
} from "@/features/projects/lib/task"
import { TaskEditorDialog } from "@/features/projects/components/task-editor-dialog"
import type { BoardTask } from "@/features/projects/components/task-card"

export function ProjectTaskList({
  projectId,
  canManage,
  onOpenTask,
}: {
  projectId: Id<"projects">
  canManage: boolean
  onOpenTask: (taskId: Id<"projectTasks">) => void
}) {
  const data = useQuery(api.projects.board, { projectId })
  const setTaskStatus = useMutation(api.projects.setTaskStatus)
  const [addOpen, setAddOpen] = React.useState(false)

  if (data === undefined) {
    return (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const byStage = new Map<string, BoardTask[]>()
  for (const s of data.stages) byStage.set(s._id, [])
  for (const t of data.tasks) {
    const key = t.stageId ?? data.stages[0]?._id
    if (key && byStage.has(key)) byStage.get(key)!.push(t)
  }

  return (
    <div className="flex flex-col gap-5 px-4 pb-6 lg:px-6">
      {canManage && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            <IconPlus className="size-4" />
            New task
          </Button>
        </div>
      )}
      {data.stages.map((stage) => {
        const list = byStage.get(stage._id) ?? []
        return (
          <div key={stage._id} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: stage.color ?? "#94a3b8" }}
              />
              <span className="text-sm font-medium">{stage.name}</span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {list.length}
              </span>
            </div>
            {list.length === 0 ? (
              <p className="text-muted-foreground pl-4 text-xs">—</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {list.map((t) => (
                  <TaskRow
                    key={t._id}
                    task={t}
                    canComplete={canManage}
                    onToggle={() =>
                      setTaskStatus({
                        taskId: t._id,
                        status: t.status === "done" ? "open" : "done",
                      }).catch(() => toast.error("Couldn't update the task."))
                    }
                    onOpen={() => onOpenTask(t._id)}
                  />
                ))}
              </ul>
            )}
          </div>
        )
      })}

      <TaskEditorDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        projectId={projectId}
      />
    </div>
  )
}

function TaskRow({
  task,
  canComplete,
  onToggle,
  onOpen,
}: {
  task: BoardTask
  canComplete: boolean
  onToggle: () => void
  onOpen: () => void
}) {
  const done = task.status === "done"
  const due = dueMeta(task.dueDate, task.status)
  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <button
        type="button"
        onClick={onToggle}
        disabled={!canComplete}
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded border",
          done ? "bg-primary border-primary text-primary-foreground" : "border-input",
          !canComplete && "opacity-60",
        )}
        aria-label="Toggle done"
      >
        {done && <IconCheck className="size-3.5" />}
      </button>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
      >
        <span className={cn("w-full truncate text-sm", done && "text-muted-foreground line-through")}>
          {task.name}
        </span>
        <span className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
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
          {due && <span className={dueToneClasses(due.tone)}>{due.label}</span>}
          {(task.estimateMinutes || task.loggedMinutes > 0) && (
            <span className="text-muted-foreground flex items-center gap-0.5">
              <IconClock className="size-3" />
              {formatMinutes(task.loggedMinutes)}
              {task.estimateMinutes ? ` / ${formatMinutes(task.estimateMinutes)}` : ""}
            </span>
          )}
          {task.assigneeCount > 0 && (
            <span className="text-muted-foreground flex items-center gap-0.5">
              <IconUsers className="size-3" />
              {task.assigneeCount}
            </span>
          )}
          {task.attachmentCount > 0 && (
            <span className="text-muted-foreground flex items-center gap-0.5">
              <IconPaperclip className="size-3" />
              {task.attachmentCount}
            </span>
          )}
        </span>
      </button>
      <IconChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
    </li>
  )
}
