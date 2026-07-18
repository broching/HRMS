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
import { useLogGesture } from "@/features/timesheets/lib/use-log-gesture"

type Board = FunctionReturnType<typeof api.attendance.attendanceDayBoard>
type Person = Board["people"][number]
type Block = Person["blocks"][number]

// Attendance is captured to the quarter-hour.
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
 * A single-day attendance board — one column per person, clock sessions drawn
 * as blocks on an hour grid (with 15-minute minor gridlines). Open sessions run
 * to the live "now" line. When `onAdd` is set, dragging on a column selects a
 * time range to record attendance for that person. Mirrors the timesheets board.
 */
export function AttendanceDayGrid({
  date,
  people,
  onAdd,
  onSelectBlock,
}: {
  date: string
  people: Person[]
  onAdd?: (person: Person, startMinute: number, endMinute: number) => void
  onSelectBlock?: (person: Person, block: Block) => void
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

  // End-of-session minute for layout: real clock-out, else the live now (today)
  // or end of the visible window.
  const endMinuteOf = React.useCallback(
    (b: Block, fallback: number) =>
      b.clockOutMinute ?? (isToday ? Math.max(nowMin, b.clockInMinute + 1) : fallback),
    [isToday, nowMin],
  )

  // Visible window covers all sessions plus the default day window.
  const spans = React.useMemo(() => {
    const all: { startMinute: number; minutes: number }[] = []
    for (const p of people) {
      for (const b of p.blocks) {
        const end = b.clockOutMinute ?? (isToday ? nowMin : b.clockInMinute + 60)
        all.push({
          startMinute: b.clockInMinute,
          minutes: Math.max(15, end - b.clockInMinute),
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

  // Drag to select on mouse; tap to log on touch (scrolling stays native).
  const gesture = useLogGesture(
    (clientY, rect) => {
      const raw = startHour * 60 + (clientY - rect.top) / PX_PER_MIN
      const snapped = Math.round(raw / SNAP) * SNAP
      return Math.max(0, Math.min(24 * 60, snapped))
    },
    (employeeId, fromMin, toMin) => {
      if (!onAdd) return
      const person = people.find((p) => p.employeeId === employeeId)
      if (!person) return
      const lo = Math.min(fromMin, toMin)
      const hi = Math.max(fromMin, toMin)
      const end = hi > lo ? hi : lo + SNAP
      onAdd(person, lo, Math.min(end, 24 * 60))
    },
  )
  const drag = gesture.drag

  // Assign overlapping sessions to side-by-side columns (calendar-style) so they
  // stay distinguishable instead of stacking. Returns each block's column index
  // and the number of columns in its overlap cluster.
  function layoutBlocks(blocks: Block[]) {
    const items = blocks
      .map((b) => ({
        id: b._id as string,
        start: b.clockInMinute,
        end: Math.max(b.clockInMinute + 1, endMinuteOf(b, endHour * 60)),
      }))
      .sort((a, b) => a.start - b.start || a.end - b.end)

    const pos = new Map<string, { col: number; cols: number }>()
    let cluster: typeof items = []
    let clusterEnd = -Infinity

    const flush = () => {
      const colEnds: number[] = [] // running end-minute per column
      for (const it of cluster) {
        let col = colEnds.findIndex((end) => end <= it.start)
        if (col === -1) {
          col = colEnds.length
          colEnds.push(it.end)
        } else {
          colEnds[col] = it.end
        }
        pos.set(it.id, { col, cols: 0 })
      }
      for (const it of cluster) pos.get(it.id)!.cols = colEnds.length
      cluster = []
      clusterEnd = -Infinity
    }

    for (const it of items) {
      if (cluster.length && it.start >= clusterEnd) flush()
      cluster.push(it)
      clusterEnd = Math.max(clusterEnd, it.end)
    }
    flush()
    return pos
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

        {/* One column per person */}
        <div className="flex flex-1">
          {people.map((person) => {
            const layout = layoutBlocks(person.blocks)
            return (
            <div
              key={person.employeeId}
              className="flex min-w-[150px] flex-1 flex-col border-l first:border-l-0"
            >
              {/* Column header */}
              <div
                className="flex h-16 items-center gap-2 border-b px-2"
                title={person.jobTitle ?? undefined}
              >
                <Avatar className="size-7 shrink-0">
                  {person.photoUrl && (
                    <AvatarImage src={person.photoUrl} alt={person.name} />
                  )}
                  <AvatarFallback className="text-[10px] font-medium">
                    {initials(person.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">
                    {person.name}
                  </div>
                  <div className="text-muted-foreground flex items-center gap-1.5 text-[11px] tabular-nums">
                    <span>{formatMinutes(person.totalMinutes)}</span>
                    {person.open && (
                      <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                        in
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Column body */}
              <div
                className={cn(
                  "relative",
                  isToday && "bg-primary/[0.02]",
                  onAdd && "cursor-copy",
                )}
                style={{ height: bodyHeight }}
                onPointerDown={
                  onAdd
                    ? (e) => {
                        if ((e.target as HTMLElement).closest("[data-block]")) return
                        gesture.onDown(e, person.employeeId)
                      }
                    : undefined
                }
                onPointerMove={onAdd ? gesture.onMove : undefined}
                onPointerUp={onAdd ? gesture.onUp : undefined}
                onPointerCancel={onAdd ? gesture.onCancel : undefined}
              >
                {/* Hour lines + 15-min minor ticks */}
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

                {/* Now line */}
                {nowVisible && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-20"
                    style={{ top: nowTop }}
                  >
                    <div className="relative">
                      <div className="h-px bg-red-500" />
                      <div className="absolute -top-1 -left-1 size-2 rounded-full bg-red-500" />
                    </div>
                  </div>
                )}

                {/* Drag-to-select preview */}
                {drag && drag.key === person.employeeId && (() => {
                  const lo = Math.min(drag.fromMin, drag.toMin)
                  const hi = Math.max(drag.fromMin, drag.toMin)
                  const span = Math.max(hi - lo, SNAP)
                  return (
                    <div
                      className="border-primary bg-primary/15 text-primary pointer-events-none absolute inset-x-0.5 z-30 flex items-start justify-center rounded-md border border-dashed"
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

                {/* Session blocks */}
                {person.blocks.map((b) => {
                  const end = endMinuteOf(b, endHour * 60)
                  const top = (b.clockInMinute - startHour * 60) * PX_PER_MIN
                  const height = Math.max(18, (end - b.clockInMinute) * PX_PER_MIN - 2)
                  const ongoing = b.clockOutMinute == null
                  // Side-by-side placement within an overlap cluster.
                  const { col, cols } = layout.get(b._id as string) ?? {
                    col: 0,
                    cols: 1,
                  }
                  const left = `calc(${(col / cols) * 100}% + 2px)`
                  const width = `calc(${100 / cols}% - ${cols > 1 ? 3 : 4}px)`
                  const compact = cols > 1
                  return (
                    <div
                      key={b._id}
                      data-block
                      role={onSelectBlock ? "button" : undefined}
                      tabIndex={onSelectBlock ? 0 : undefined}
                      onClick={
                        onSelectBlock
                          ? (e) => {
                              e.stopPropagation()
                              onSelectBlock(person, b)
                            }
                          : undefined
                      }
                      onKeyDown={
                        onSelectBlock
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault()
                                onSelectBlock(person, b)
                              }
                            }
                          : undefined
                      }
                      className={cn(
                        "absolute z-10 overflow-hidden rounded-md border-l-2 py-1 text-left shadow-sm",
                        compact ? "px-1" : "px-1.5",
                        onSelectBlock &&
                          "cursor-pointer transition-shadow hover:z-20 hover:shadow-md focus:z-20 focus:ring-primary/50 focus:ring-2 focus:outline-none",
                        ongoing
                          ? "border-emerald-500 bg-emerald-100/90 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-100"
                          : "border-sky-500 bg-sky-100/90 text-sky-900 dark:bg-sky-950/70 dark:text-sky-100",
                      )}
                      style={{ top, height, left, width }}
                      title={`${formatClock(b.clockInMinute)} – ${
                        b.clockOutMinute != null
                          ? formatClock(b.clockOutMinute)
                          : "now"
                      }${b.method === "manual" ? " · added manually" : ""}`}
                    >
                      <div
                        className={cn(
                          "font-semibold tabular-nums",
                          compact ? "text-[9px] leading-tight" : "text-[10px]",
                        )}
                      >
                        {formatClock(b.clockInMinute)}
                        {compact ? "" : " – "}
                        {compact ? (
                          <span className="block">
                            {b.clockOutMinute != null
                              ? formatClock(b.clockOutMinute)
                              : "now"}
                          </span>
                        ) : b.clockOutMinute != null ? (
                          formatClock(b.clockOutMinute)
                        ) : (
                          "now"
                        )}
                      </div>
                      {b.method === "manual" && !compact && (
                        <div className="text-[9px] opacity-70">manual</div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
