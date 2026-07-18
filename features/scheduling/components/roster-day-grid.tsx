"use client"

import * as React from "react"
import type { FunctionReturnType } from "convex/server"
import { api } from "@/convex/_generated/api"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import {
  HOUR_HEIGHT,
  PX_PER_MIN,
  gridBounds,
  formatClock,
  formatMinutes,
  todayIso,
} from "@/features/timesheets/lib/time"
import { packLanes } from "@/features/timesheets/lib/layout"
import { useLogGesture } from "@/features/timesheets/lib/use-log-gesture"

type Board = FunctionReturnType<typeof api.schedules.rosterDay>
export type RosterPerson = Board["people"][number]
type Block = RosterPerson["blocks"][number]

const SNAP = 15

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")
}

/**
 * Single-day roster board — one column per person. Overlays the scheduled shift
 * (dashed ghost), scheduled overtime (amber) and actual clocked attendance
 * (solid) on the same hour grid, with a variance badge and an OT suggestion when
 * work ran past the scheduled end. Dragging a column adds a shift/OT.
 */
export function RosterDayGrid({
  date,
  people,
  onAdd,
  onEditShift,
  onEditOvertime,
  onConfirmOt,
}: {
  date: string
  people: RosterPerson[]
  onAdd: (person: RosterPerson, startMinute: number, endMinute: number) => void
  onEditShift: (person: RosterPerson, block: Block) => void
  onEditOvertime: (person: RosterPerson, block: Block) => void
  onConfirmOt: (person: RosterPerson) => void
}) {
  const isToday = date === todayIso()

  const [nowMin, setNowMin] = React.useState(() => {
    const n = new Date()
    return n.getHours() * 60 + n.getMinutes()
  })
  React.useEffect(() => {
    const t = setInterval(() => {
      const n = new Date()
      setNowMin(n.getHours() * 60 + n.getMinutes())
    }, 60_000)
    return () => clearInterval(t)
  }, [])

  const endOf = React.useCallback(
    (b: Block) =>
      b.endMinute ?? (isToday ? Math.max(nowMin, b.startMinute + 1) : b.startMinute + 60),
    [isToday, nowMin],
  )

  const spans = React.useMemo(() => {
    const all: { startMinute: number; minutes: number }[] = []
    for (const p of people) {
      for (const b of p.blocks) {
        const end = b.endMinute ?? (isToday ? nowMin : b.startMinute + 60)
        all.push({
          startMinute: b.startMinute,
          minutes: Math.max(15, end - b.startMinute),
        })
      }
    }
    return all
  }, [people, isToday, nowMin])

  const { startHour, endHour } = gridBounds(spans)
  const hours = React.useMemo(
    () => Array.from({ length: endHour - startHour }, (_, i) => startHour + i),
    [startHour, endHour],
  )
  const bodyHeight = (endHour - startHour) * HOUR_HEIGHT
  const nowVisible = isToday && nowMin >= startHour * 60 && nowMin <= endHour * 60
  const nowTop = (nowMin - startHour * 60) * PX_PER_MIN

  // Drag to select on mouse; tap to add on touch (scrolling stays native).
  const gesture = useLogGesture(
    (clientY, rect) => {
      const raw = startHour * 60 + (clientY - rect.top) / PX_PER_MIN
      const snapped = Math.round(raw / SNAP) * SNAP
      return Math.max(0, Math.min(24 * 60, snapped))
    },
    (employeeId, fromMin, toMin) => {
      const person = people.find((p) => p.employeeId === employeeId)
      if (!person) return
      const lo = Math.min(fromMin, toMin)
      const hi = Math.max(fromMin, toMin)
      const end = hi > lo ? hi : lo + 60
      onAdd(person, lo, Math.min(end, 24 * 60))
    },
  )
  const drag = gesture.drag

  function blockStyle(b: Block) {
    const top = (b.startMinute - startHour * 60) * PX_PER_MIN
    const height = Math.max(18, (endOf(b) - b.startMinute) * PX_PER_MIN - 2)
    return { top, height }
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-fit">
        {/* Hour gutter */}
        <div className="w-14 shrink-0">
          <div className="h-16 border-b" />
          <div style={{ height: bodyHeight }} className="relative">
            {hours.map((h, i) => (
              <div
                key={h}
                className="text-muted-foreground absolute right-2 -translate-y-1/2 text-[11px] tabular-nums"
                style={{ top: i * HOUR_HEIGHT }}
              >
                {formatClock(h * 60)}
              </div>
            ))}
          </div>
        </div>

        {/* Columns */}
        <div className="flex flex-1">
          {people.map((person) => (
            <div
              key={person.employeeId}
              className="flex min-w-[160px] flex-1 flex-col border-l first:border-l-0"
            >
              {/* Header */}
              <div className="flex h-16 items-center gap-2 border-b px-2">
                <Avatar className="size-7 shrink-0">
                  {person.photoUrl && (
                    <AvatarImage src={person.photoUrl} alt={person.name} />
                  )}
                  <AvatarFallback className="text-[10px] font-medium">
                    {initials(person.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">{person.name}</div>
                  <div className="flex flex-wrap items-center gap-1 text-[10px]">
                    <span className="text-muted-foreground tabular-nums">
                      {formatMinutes(person.scheduledMinutes)} sched
                    </span>
                    {person.open && (
                      <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                        <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                        in
                      </span>
                    )}
                    {person.variance.lateStartMin > 0 && (
                      <span className="text-amber-600 dark:text-amber-400">
                        {person.variance.lateStartMin}m late
                      </span>
                    )}
                    {person.variance.absent && (
                      <span className="text-red-600 dark:text-red-400">absent</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Body */}
              <div
                className={cn("relative cursor-copy", isToday && "bg-primary/[0.02]")}
                style={{ height: bodyHeight }}
                onPointerDown={(e) => {
                  if ((e.target as HTMLElement).closest("[data-block]")) return
                  gesture.onDown(e, person.employeeId)
                }}
                onPointerMove={gesture.onMove}
                onPointerUp={gesture.onUp}
                onPointerCancel={gesture.onCancel}
              >
                {/* Gridlines */}
                {hours.map((h, i) => (
                  <React.Fragment key={h}>
                    <div
                      className="border-border/60 absolute inset-x-0 border-t"
                      style={{ top: i * HOUR_HEIGHT }}
                    />
                    {[15, 30, 45].map((q) => (
                      <div
                        key={q}
                        className="border-border/25 absolute inset-x-0 border-t border-dashed"
                        style={{ top: i * HOUR_HEIGHT + (q / 60) * HOUR_HEIGHT }}
                      />
                    ))}
                  </React.Fragment>
                ))}
                <div
                  className="border-border/60 absolute inset-x-0 border-t"
                  style={{ top: bodyHeight }}
                />

                {nowVisible && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-30"
                    style={{ top: nowTop }}
                  >
                    <div className="relative">
                      <div className="h-px bg-red-500" />
                      <div className="absolute -top-1 -left-1 size-2 rounded-full bg-red-500" />
                    </div>
                  </div>
                )}

                {/* Drag preview */}
                {drag && drag.key === person.employeeId && (() => {
                  const lo = Math.min(drag.fromMin, drag.toMin)
                  const hi = Math.max(drag.fromMin, drag.toMin)
                  const span = Math.max(hi - lo, SNAP)
                  return (
                    <div
                      className="border-primary bg-primary/15 text-primary pointer-events-none absolute inset-x-0.5 z-40 flex items-start justify-center rounded-md border border-dashed"
                      style={{
                        top: (lo - startHour * 60) * PX_PER_MIN,
                        height: Math.max(20, span * PX_PER_MIN),
                      }}
                    >
                      <span className="mt-0.5 text-[10px] font-medium tabular-nums">
                        {formatClock(lo)} · {formatMinutes(span)}
                      </span>
                    </div>
                  )
                })()}

                {/* Scheduled blocks (ghost, behind) */}
                {person.blocks
                  .filter((b) => b.kind === "scheduled")
                  .map((b, i) => (
                    <button
                      key={`s${i}`}
                      data-block
                      onClick={() => b.shiftId && onEditShift(person, b)}
                      disabled={!b.shiftId}
                      className={cn(
                        "absolute inset-x-0.5 z-10 overflow-hidden rounded-md border px-1.5 py-1 text-left",
                        b.derived
                          ? "border-dashed border-indigo-400/70 bg-indigo-400/5 text-indigo-700 dark:text-indigo-300"
                          : "cursor-pointer border-indigo-500/60 bg-indigo-500/10 text-indigo-700 hover:bg-indigo-500/20 dark:text-indigo-200",
                      )}
                      style={blockStyle(b)}
                      title={b.derived ? "From work pattern (edit to override)" : "Scheduled shift"}
                    >
                      <div className="text-[10px] font-semibold tabular-nums">
                        {b.label}
                      </div>
                      {b.derived && <div className="text-[9px] opacity-70">pattern</div>}
                    </button>
                  ))}

                {/* Foreground events (overtime + actual attendance). Overlapping
                    records are packed into side-by-side lanes — like the
                    timesheet grid — so none obscure another. The scheduled ghost
                    above stays full-width behind as the plan backdrop. */}
                {packLanes(
                  person.blocks
                    .filter((b) => b.kind === "overtime" || b.kind === "actual")
                    .map((b) => ({
                      block: b,
                      startMinute: b.startMinute,
                      minutes: Math.max(15, endOf(b) - b.startMinute),
                    })),
                ).map(({ item, lane, lanes }, i) => {
                  const b = item.block
                  const { top, height } = blockStyle(b)
                  const widthPct = 100 / lanes
                  const pos: React.CSSProperties = {
                    top,
                    height,
                    left: `calc(${lane * widthPct}% + 2px)`,
                    width: `calc(${widthPct}% - 4px)`,
                  }
                  if (b.kind === "overtime") {
                    return (
                      <button
                        key={`o${i}`}
                        data-block
                        onClick={() => onEditOvertime(person, b)}
                        className="absolute z-20 cursor-pointer overflow-hidden rounded-md border border-amber-500/70 bg-amber-400/25 px-1 py-1 text-left text-amber-800 hover:z-30 hover:bg-amber-400/40 dark:text-amber-200"
                        style={pos}
                        title="Scheduled overtime"
                      >
                        <div className="truncate text-[10px] font-semibold tabular-nums">
                          {b.label}
                        </div>
                      </button>
                    )
                  }
                  const ongoing = b.endMinute == null
                  return (
                    <div
                      key={`a${i}`}
                      data-block
                      className={cn(
                        "pointer-events-none absolute z-20 overflow-hidden rounded-md border-l-2 px-1 py-0.5 text-left shadow-sm",
                        ongoing
                          ? "border-emerald-500 bg-emerald-200/70 text-emerald-900 dark:bg-emerald-800/60 dark:text-emerald-50"
                          : "border-sky-500 bg-sky-200/70 text-sky-900 dark:bg-sky-800/60 dark:text-sky-50",
                      )}
                      style={pos}
                      title="Actual clocked time"
                    >
                      <div className="truncate text-[9px] font-semibold tabular-nums">
                        {formatClock(b.startMinute)}–
                        {b.endMinute != null ? formatClock(b.endMinute) : "now"}
                      </div>
                    </div>
                  )
                })}

                {/* OT suggestion */}
                {person.otSuggestion && (
                  <button
                    data-block
                    onClick={() => onConfirmOt(person)}
                    className="absolute inset-x-1 bottom-1 z-30 rounded-md border border-amber-500 bg-amber-500/90 px-1.5 py-1 text-[10px] font-medium text-white shadow hover:bg-amber-500"
                    title="Clocked past the scheduled end — confirm overtime"
                  >
                    + OT {person.otSuggestion.hours}h?
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
