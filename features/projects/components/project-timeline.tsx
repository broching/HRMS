"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { IconPlus, IconFlag3, IconTrash, IconPencil } from "@tabler/icons-react"
import { toast } from "sonner"
import { getErrorMessage } from "@/lib/errors"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { todayIso } from "@/features/timesheets/lib/time"
import { priorityClasses, type TaskPriority } from "@/features/projects/lib/task"

type TimelineData = FunctionReturnType<typeof api.projects.timeline>
type TimelineTask = TimelineData["tasks"][number]

const DAY_W = 34 // px per day
const ROW_H = 34
const LABEL_W = 200

// ── ISO date helpers ─────────────────────────────────────────────────────────
function toDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}
function toIso(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
    dt.getDate(),
  ).padStart(2, "0")}`
}
function addDays(iso: string, days: number): string {
  const dt = toDate(iso)
  dt.setDate(dt.getDate() + days)
  return toIso(dt)
}
function daysBetween(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000)
}

// The bar span for a task: [start, end] inclusive. Falls back to a single day on
// whichever date exists.
function spanOf(t: TimelineTask): { start: string; end: string } | null {
  const start = t.startDate ?? t.dueDate
  const end = t.dueDate ?? t.startDate
  if (!start || !end) return null
  return start <= end ? { start, end } : { start: end, end: start }
}

export function ProjectTimeline({
  projectId,
  canManage,
  onOpenTask,
}: {
  projectId: Id<"projects">
  canManage: boolean
  onOpenTask: (taskId: Id<"projectTasks">) => void
}) {
  const data = useQuery(api.projects.timeline, { projectId })
  const updateTask = useMutation(api.projects.updateTask)
  const [milestoneOpen, setMilestoneOpen] = React.useState(false)

  // Local drag state for a bar being repositioned.
  const [drag, setDrag] = React.useState<{
    taskId: Id<"projectTasks">
    startX: number
    origStart: string
    origEnd: string
    deltaDays: number
  } | null>(null)

  const scheduled = React.useMemo(
    () => (data?.tasks ?? []).filter((t) => spanOf(t) !== null),
    [data],
  )
  const unscheduledCount = (data?.tasks.length ?? 0) - scheduled.length

  // Overall date window (padded a few days each side).
  const range = React.useMemo(() => {
    const dates: string[] = [todayIso()]
    for (const t of scheduled) {
      const s = spanOf(t)!
      dates.push(s.start, s.end)
    }
    for (const m of data?.milestones ?? []) dates.push(m.dueDate)
    const min = dates.reduce((a, b) => (a < b ? a : b))
    const max = dates.reduce((a, b) => (a > b ? a : b))
    return { start: addDays(min, -3), end: addDays(max, 4) }
  }, [scheduled, data])

  const totalDays = data ? daysBetween(range.start, range.end) + 1 : 0
  const gridW = totalDays * DAY_W

  // Month header segments.
  const months = React.useMemo(() => {
    if (!data) return []
    const out: { label: string; left: number; width: number }[] = []
    let i = 0
    while (i < totalDays) {
      const iso = addDays(range.start, i)
      const dt = toDate(iso)
      const monthStart = i
      // advance to end of this month
      while (i < totalDays && toDate(addDays(range.start, i)).getMonth() === dt.getMonth()) {
        i++
      }
      out.push({
        label: dt.toLocaleDateString(undefined, { month: "short", year: "numeric" }),
        left: monthStart * DAY_W,
        width: (i - monthStart) * DAY_W,
      })
    }
    return out
  }, [data, totalDays, range.start])

  const rowIndex = React.useMemo(() => {
    const m = new Map<Id<"projectTasks">, number>()
    scheduled.forEach((t, i) => m.set(t._id, i))
    return m
  }, [scheduled])

  function onBarPointerDown(
    e: React.PointerEvent,
    t: TimelineTask,
    span: { start: string; end: string },
  ) {
    if (!canManage) return
    e.preventDefault()
    setDrag({
      taskId: t._id,
      startX: e.clientX,
      origStart: span.start,
      origEnd: span.end,
      deltaDays: 0,
    })
  }

  React.useEffect(() => {
    if (!drag) return
    function move(e: PointerEvent) {
      setDrag((d) =>
        d ? { ...d, deltaDays: Math.round((e.clientX - d.startX) / DAY_W) } : d,
      )
    }
    async function up() {
      const d = drag
      setDrag(null)
      if (!d || d.deltaDays === 0) return
      try {
        await updateTask({
          taskId: d.taskId,
          startDate: addDays(d.origStart, d.deltaDays),
          dueDate: addDays(d.origEnd, d.deltaDays),
        })
      } catch (e) {
        toast.error(getErrorMessage(e, "Couldn't reschedule the task."))
      }
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up, { once: true })
    return () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
  }, [drag, updateTask])

  if (data === undefined) {
    return (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  const chartH = scheduled.length * ROW_H

  // Dependency connector lines (from bar end → to bar start).
  const connectors = data.links
    .map((l) => {
      const fi = rowIndex.get(l.fromTaskId)
      const ti = rowIndex.get(l.toTaskId)
      const from = scheduled.find((t) => t._id === l.fromTaskId)
      const to = scheduled.find((t) => t._id === l.toTaskId)
      if (fi === undefined || ti === undefined || !from || !to) return null
      const fs = spanOf(from)!
      const ts = spanOf(to)!
      const x1 = (daysBetween(range.start, fs.end) + 1) * DAY_W
      const y1 = fi * ROW_H + ROW_H / 2
      const x2 = daysBetween(range.start, ts.start) * DAY_W
      const y2 = ti * ROW_H + ROW_H / 2
      return { x1, y1, x2, y2, key: l._id }
    })
    .filter((c): c is NonNullable<typeof c> => !!c)

  const todayLeft = daysBetween(range.start, todayIso()) * DAY_W

  return (
    <div className="flex flex-col gap-3 px-4 pb-6 lg:px-6">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {scheduled.length} scheduled
          {unscheduledCount > 0 ? ` · ${unscheduledCount} without dates` : ""}
        </p>
        {canManage && (
          <Button variant="outline" size="sm" onClick={() => setMilestoneOpen(true)}>
            <IconFlag3 className="size-4" />
            Milestones
          </Button>
        )}
      </div>

      {scheduled.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-16 text-center text-sm">
          No tasks with start/due dates yet. Add dates to a task to see it here.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <div className="flex min-w-fit">
            {/* Left label column */}
            <div className="bg-background sticky left-0 z-10 shrink-0 border-r" style={{ width: LABEL_W }}>
              <div className="h-14 border-b" />
              {scheduled.map((t) => (
                <button
                  key={t._id}
                  type="button"
                  onClick={() => onOpenTask(t._id)}
                  style={{ height: ROW_H }}
                  className="hover:bg-accent/40 flex w-full items-center gap-1.5 border-b px-3 text-left"
                >
                  {t.parentTaskId && (
                    <span className="text-muted-foreground/50 text-xs">↳</span>
                  )}
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-xs",
                      t.status === "done" && "text-muted-foreground line-through",
                    )}
                  >
                    {t.name}
                  </span>
                </button>
              ))}
            </div>

            {/* Chart area */}
            <div className="relative" style={{ width: gridW }}>
              {/* Month header */}
              <div className="relative h-8 border-b" style={{ width: gridW }}>
                {months.map((m, i) => (
                  <div
                    key={i}
                    className="text-muted-foreground absolute top-0 flex h-8 items-center border-r px-2 text-[11px] font-medium"
                    style={{ left: m.left, width: m.width }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
              {/* Milestone lane */}
              <div className="relative h-6 border-b" style={{ width: gridW }}>
                {data.milestones.map((m) => {
                  const left = daysBetween(range.start, m.dueDate) * DAY_W
                  if (left < 0 || left > gridW) return null
                  return (
                    <div
                      key={m._id}
                      className="absolute top-1 flex items-center gap-1"
                      style={{ left: left - 5 }}
                      title={`${m.name} · ${m.dueDate}`}
                    >
                      <span className="size-2.5 rotate-45 bg-fuchsia-500" />
                      <span className="text-fuchsia-600 dark:text-fuchsia-400 text-[10px] whitespace-nowrap">
                        {m.name}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Grid + bars */}
              <div className="relative" style={{ width: gridW, height: chartH }}>
                {/* Weekend / day gridlines */}
                {Array.from({ length: totalDays }).map((_, i) => {
                  const iso = addDays(range.start, i)
                  const wd = toDate(iso).getDay()
                  const weekend = wd === 0 || wd === 6
                  return (
                    <div
                      key={i}
                      className={cn(
                        "absolute top-0 bottom-0 border-r",
                        weekend ? "bg-muted/40" : "",
                      )}
                      style={{ left: i * DAY_W, width: DAY_W }}
                    />
                  )
                })}

                {/* Today marker */}
                {todayLeft >= 0 && todayLeft <= gridW && (
                  <div
                    className="absolute top-0 bottom-0 z-10 w-px bg-red-500/70"
                    style={{ left: todayLeft }}
                  />
                )}

                {/* Dependency connectors */}
                {connectors.length > 0 && (
                  <svg
                    className="pointer-events-none absolute inset-0 z-20"
                    width={gridW}
                    height={chartH}
                  >
                    <defs>
                      <marker
                        id="arrow"
                        markerWidth="6"
                        markerHeight="6"
                        refX="5"
                        refY="3"
                        orient="auto"
                      >
                        <path d="M0,0 L6,3 L0,6 Z" className="fill-muted-foreground" />
                      </marker>
                    </defs>
                    {connectors.map((c) => (
                      <path
                        key={c.key}
                        d={`M ${c.x1} ${c.y1} C ${c.x1 + 16} ${c.y1}, ${c.x2 - 16} ${c.y2}, ${c.x2} ${c.y2}`}
                        className="stroke-muted-foreground/50 fill-none"
                        strokeWidth={1.5}
                        markerEnd="url(#arrow)"
                      />
                    ))}
                  </svg>
                )}

                {/* Task bars */}
                {scheduled.map((t, i) => {
                  const span = spanOf(t)!
                  const isDragging = drag?.taskId === t._id
                  const shift = isDragging ? drag!.deltaDays : 0
                  const left = (daysBetween(range.start, span.start) + shift) * DAY_W
                  const width = (daysBetween(span.start, span.end) + 1) * DAY_W
                  const done = t.status === "done"
                  return (
                    <div
                      key={t._id}
                      className="absolute z-10"
                      style={{ top: i * ROW_H + 6, left, height: ROW_H - 12 }}
                    >
                      <div
                        role="button"
                        onPointerDown={(e) => onBarPointerDown(e, t, span)}
                        onClick={() => !isDragging && onOpenTask(t._id)}
                        style={{ width }}
                        className={cn(
                          "flex h-full items-center overflow-hidden rounded-md px-2 text-[11px] shadow-sm",
                          canManage ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                          done
                            ? "bg-emerald-500/25 text-emerald-800 dark:text-emerald-200"
                            : t.priority === "high"
                              ? "bg-red-500/25 text-red-800 dark:text-red-200"
                              : "bg-primary/25 text-foreground",
                        )}
                        title={`${t.name} · ${span.start} → ${span.end}`}
                      >
                        <span className="truncate">{t.name}</span>
                        {t.priority && (
                          <span
                            className={cn(
                              "ml-1 shrink-0 rounded-full border px-1 text-[9px]",
                              priorityClasses(t.priority as TaskPriority),
                            )}
                          >
                            {t.priority[0].toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <MilestoneManager
        projectId={projectId}
        open={milestoneOpen}
        onOpenChange={setMilestoneOpen}
      />
    </div>
  )
}

function MilestoneManager({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: Id<"projects">
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const milestones = useQuery(
    api.projects.listMilestones,
    open ? { projectId } : "skip",
  )
  const create = useMutation(api.projects.createMilestone)
  const update = useMutation(api.projects.updateMilestone)
  const remove = useMutation(api.projects.removeMilestone)

  const [name, setName] = React.useState("")
  const [dueDate, setDueDate] = React.useState("")

  async function add() {
    if (!name.trim() || !dueDate) {
      toast.error("Give the milestone a name and date.")
      return
    }
    try {
      await create({ projectId, name, dueDate })
      setName("")
      setDueDate("")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't add the milestone."))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Milestones</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-1">
            {(milestones ?? []).map((m) => (
              <MilestoneRow
                key={m._id}
                milestone={m}
                onRename={(name) =>
                  update({ milestoneId: m._id, name }).catch(() =>
                    toast.error("Couldn't rename."),
                  )
                }
                onDate={(dueDate) =>
                  update({ milestoneId: m._id, dueDate }).catch(() =>
                    toast.error("Couldn't update the date."),
                  )
                }
                onRemove={() =>
                  remove({ milestoneId: m._id }).catch(() =>
                    toast.error("Couldn't remove."),
                  )
                }
              />
            ))}
            {(milestones ?? []).length === 0 && (
              <p className="text-muted-foreground py-2 text-center text-xs">
                No milestones yet.
              </p>
            )}
          </ul>
          <div className="flex flex-col gap-2 border-t pt-3">
            <Label className="text-xs">Add a milestone</Label>
            <div className="flex items-center gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name…"
                className="h-8"
              />
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-8 w-40 shrink-0"
              />
              <Button size="sm" onClick={add}>
                <IconPlus className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function MilestoneRow({
  milestone,
  onRename,
  onDate,
  onRemove,
}: {
  milestone: { _id: Id<"projectMilestones">; name: string; dueDate: string }
  onRename: (name: string) => void
  onDate: (dueDate: string) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = React.useState(false)
  const [name, setName] = React.useState(milestone.name)
  React.useEffect(() => setName(milestone.name), [milestone.name])

  return (
    <li className="hover:bg-muted/40 flex items-center gap-2 rounded-md px-2 py-1.5">
      <span className="size-2.5 rotate-45 shrink-0 bg-fuchsia-500" />
      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const t = name.trim()
            if (t && t !== milestone.name) onRename(t)
            setEditing(false)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur()
          }}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm">{milestone.name}</span>
      )}
      <Input
        type="date"
        value={milestone.dueDate}
        onChange={(e) => e.target.value && onDate(e.target.value)}
        className="h-7 w-36 shrink-0 text-xs"
      />
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-muted-foreground hover:text-foreground shrink-0"
        title="Rename"
      >
        <IconPencil className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="text-muted-foreground hover:text-destructive shrink-0"
        title="Delete"
      >
        <IconTrash className="size-3.5" />
      </button>
    </li>
  )
}
