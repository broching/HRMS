"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import {
  IconChecklist,
  IconCheck,
  IconPaperclip,
  IconCalendarEvent,
  IconFlag,
  IconTag,
  IconChevronDown,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import {
  dueMeta,
  dueToneClasses,
  priorityClasses,
  priorityLabel,
  PRIORITY_OPTIONS,
  type TaskPriority,
} from "@/features/projects/lib/task"
import { TaskDetailPanel } from "@/features/projects/components/task-detail-panel"
import { LabelChip } from "@/features/projects/components/task-labels"

const ANY = "__any__"

type MyTask = FunctionReturnType<typeof api.projects.myTasks>[number]

/**
 * Personal "My Tasks" — every task assigned to the signed-in employee (directly
 * or via a project they're on). Grouped by project; click a task to open the
 * full detail panel where an assignee can mark it complete.
 */
export function MyTasks() {
  const tasks = useQuery(api.projects.myTasks)
  const [filter, setFilter] = React.useState<"open" | "all">("open")
  const [priority, setPriority] = React.useState<TaskPriority[]>([])
  const [labelIds, setLabelIds] = React.useState<Id<"taskLabels">[]>([])
  const [due, setDue] = React.useState<"overdue" | "soon" | "none" | null>(null)
  const [openTaskId, setOpenTaskId] = React.useState<Id<"projectTasks"> | null>(null)

  // Labels present across the caller's tasks, for the label filter menu.
  const availableLabels = React.useMemo(() => {
    const m = new Map<string, { _id: Id<"taskLabels">; name: string; color: string }>()
    for (const t of tasks ?? []) for (const l of t.labels) m.set(l._id, l)
    return [...m.values()]
  }, [tasks])

  const visible = (tasks ?? []).filter((t) => {
    if (filter === "open" && t.status !== "open") return false
    if (priority.length && (!t.priority || !priority.includes(t.priority as TaskPriority)))
      return false
    if (labelIds.length && !t.labels.some((l) => labelIds.includes(l._id))) return false
    if (due) {
      if (due === "none") {
        if (t.dueDate) return false
      } else {
        const meta = dueMeta(t.dueDate, t.status)
        if (!meta || meta.tone !== due) return false
      }
    }
    return true
  })

  function togglePriority(p: TaskPriority) {
    setPriority((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]))
  }
  function toggleLabel(id: Id<"taskLabels">) {
    setLabelIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  // Group by project, preserving the server's sort within each group.
  const groups = React.useMemo(() => {
    const m = new Map<
      string,
      { name: string; color: string | null; tasks: MyTask[] }
    >()
    for (const t of visible) {
      const g = m.get(t.projectId) ?? {
        name: t.projectName,
        color: t.projectColor,
        tasks: [],
      }
      g.tasks.push(t)
      m.set(t.projectId, g)
    }
    return [...m.values()]
  }, [visible])

  const openCount = (tasks ?? []).filter((t) => t.status === "open").length

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground text-sm">
          {openCount > 0
            ? `${openCount} open ${openCount === 1 ? "task" : "tasks"} assigned to you.`
            : "Tasks assigned to you across your projects."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn("h-8 gap-1", priority.length > 0 && "border-primary/50")}
              >
                <IconFlag className="size-3.5" />
                Priority
                {priority.length > 0 && (
                  <span className="bg-primary text-primary-foreground ml-0.5 rounded-full px-1 text-[10px]">
                    {priority.length}
                  </span>
                )}
                <IconChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 p-1">
              {PRIORITY_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => togglePriority(o.value)}
                  className="hover:bg-accent/60 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm"
                >
                  <Checkbox checked={priority.includes(o.value)} className="pointer-events-none" />
                  {o.label}
                </button>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {availableLabels.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn("h-8 gap-1", labelIds.length > 0 && "border-primary/50")}
                >
                  <IconTag className="size-3.5" />
                  Labels
                  {labelIds.length > 0 && (
                    <span className="bg-primary text-primary-foreground ml-0.5 rounded-full px-1 text-[10px]">
                      {labelIds.length}
                    </span>
                  )}
                  <IconChevronDown className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 p-1">
                {availableLabels.map((l) => (
                  <button
                    key={l._id}
                    type="button"
                    onClick={() => toggleLabel(l._id)}
                    className="hover:bg-accent/60 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm"
                  >
                    <Checkbox checked={labelIds.includes(l._id)} className="pointer-events-none" />
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                    <span className="min-w-0 flex-1 truncate">{l.name}</span>
                  </button>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Select
            value={due ?? ANY}
            onValueChange={(v) => setDue(v === ANY ? null : (v as "overdue" | "soon" | "none"))}
          >
            <SelectTrigger size="sm" className="h-8 w-auto gap-1">
              <SelectValue placeholder="Due" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any due</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="soon">Due soon</SelectItem>
              <SelectItem value="none">No due date</SelectItem>
            </SelectContent>
          </Select>

          <ToggleGroup
            type="single"
            value={filter}
            onValueChange={(v) => v && setFilter(v as "open" | "all")}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="open" className="px-3">
              Open
            </ToggleGroupItem>
            <ToggleGroupItem value="all" className="px-3">
              All
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {tasks === undefined ? (
        <Skeleton className="h-48 w-full" />
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <IconChecklist className="text-muted-foreground size-8" stroke={1.5} />
          <p className="text-muted-foreground text-sm">
            {filter === "open"
              ? "No open tasks — you're all caught up."
              : "No tasks assigned to you yet."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((g, gi) => (
            <div key={gi} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: g.color ?? "#94a3b8" }}
                />
                <h2 className="text-sm font-semibold">{g.name}</h2>
                <span className="text-muted-foreground text-xs">
                  {g.tasks.length}
                </span>
              </div>
              <Card className="divide-y p-0">
                {g.tasks.map((t) => (
                  <TaskRow key={t._id} task={t} onOpen={() => setOpenTaskId(t._id)} />
                ))}
              </Card>
            </div>
          ))}
        </div>
      )}

      <TaskDetailPanel
        taskId={openTaskId}
        open={openTaskId !== null}
        onOpenChange={(o) => !o && setOpenTaskId(null)}
      />
    </div>
  )
}

function TaskRow({ task, onOpen }: { task: MyTask; onOpen: () => void }) {
  const done = task.status === "done"
  const due = dueMeta(task.dueDate, task.status)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="hover:bg-accent/40 flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors"
    >
      <span
        className={cn(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
          done
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-input",
        )}
      >
        {done && <IconCheck className="size-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "min-w-0 truncate text-sm font-medium",
              done && "text-muted-foreground line-through",
            )}
          >
            {task.name}
          </span>
          {task.labels.map((l) => (
            <LabelChip key={l._id} label={l} />
          ))}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {task.priority && (
            <span
              className={cn(
                "flex items-center gap-1 rounded-full border px-1.5 py-0.5",
                priorityClasses(task.priority as TaskPriority),
              )}
            >
              <IconFlag className="size-3" />
              {priorityLabel(task.priority as TaskPriority)}
            </span>
          )}
          {due && (
            <span className={cn("flex items-center gap-1", dueToneClasses(due.tone))}>
              <IconCalendarEvent className="size-3.5" />
              {due.label}
            </span>
          )}
          {task.attachmentCount > 0 && (
            <span className="text-muted-foreground flex items-center gap-1">
              <IconPaperclip className="size-3.5" />
              {task.attachmentCount}
            </span>
          )}
          {task.viaProject && (
            <Badge variant="outline" className="text-muted-foreground text-[10px]">
              Project
            </Badge>
          )}
        </div>
      </div>
    </button>
  )
}
