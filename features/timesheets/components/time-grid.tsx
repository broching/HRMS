"use client"

import * as React from "react"
import type { FunctionReturnType } from "convex/server"
import { api } from "@/convex/_generated/api"
import { cn } from "@/lib/utils"
import {
  HOUR_HEIGHT,
  PX_PER_MIN,
  gridBounds,
  formatClock,
  formatMinutes,
  dowLabel,
  dayOfMonth,
  todayIso,
} from "@/features/timesheets/lib/time"
import { packLanes } from "@/features/timesheets/lib/layout"
import { useLogGesture } from "@/features/timesheets/lib/use-log-gesture"

type Entry = FunctionReturnType<typeof api.timeEntries.mine>[number]

// Drag-to-select snaps to whole hours (10am, 11am …) for fast blocking-out;
// finer minute-level control is available in the edit form.
const SNAP = 60 // minutes

/**
 * Hourly calendar grid. Renders an hour gutter plus one column per date, with
 * timed entries positioned as blocks. Click an empty slot to create (unless
 * read-only). Only entries with a `startMinute` are shown here; unscheduled
 * entries are handled by the caller.
 */
export function TimeGrid({
  dates,
  entriesByDate,
  onCreate,
  onSelect,
  readOnly = false,
}: {
  dates: string[]
  entriesByDate: Map<string, Entry[]>
  onCreate?: (date: string, minute: number, minutes?: number) => void
  onSelect?: (entry: Entry) => void
  readOnly?: boolean
}) {
  const today = todayIso()

  // Compute a shared visible window across all columns.
  const timed = React.useMemo(() => {
    const all: { startMinute: number; minutes: number }[] = []
    for (const d of dates) {
      for (const e of entriesByDate.get(d) ?? []) {
        if (e.startMinute != null) all.push({ startMinute: e.startMinute, minutes: e.minutes })
      }
    }
    return all
  }, [dates, entriesByDate])

  const { startHour, endHour } = gridBounds(timed)
  const hours = React.useMemo(
    () => Array.from({ length: endHour - startHour }, (_, i) => startHour + i),
    [startHour, endHour],
  )
  const bodyHeight = (endHour - startHour) * HOUR_HEIGHT

  // Live "now" offset for today's column.
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
  const nowVisible = nowMin >= startHour * 60 && nowMin <= endHour * 60
  const nowTop = (nowMin - startHour * 60) * PX_PER_MIN

  // Drag to size on mouse; tap to create on touch (scrolling stays native).
  // A press with (almost) no drag → default-length entry; a real drag sizes it.
  const gesture = useLogGesture(
    (clientY, rect) => {
      const raw = startHour * 60 + (clientY - rect.top) / PX_PER_MIN
      const snapped = Math.round(raw / SNAP) * SNAP
      return Math.max(0, Math.min(24 * 60, snapped))
    },
    (date, fromMin, toMin) => {
      if (!onCreate) return
      const lo = Math.min(fromMin, toMin)
      const hi = Math.max(fromMin, toMin)
      const span = hi - lo
      const start = Math.min(lo, 24 * 60 - SNAP)
      if (span < SNAP) onCreate(date, start)
      else onCreate(date, start, Math.min(span, 24 * 60 - start))
    },
  )
  const drag = gesture.drag

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-fit">
        {/* Hour gutter */}
        <div className="w-14 shrink-0 pt-8">
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

        {/* Day columns */}
        <div className="flex flex-1">
          {dates.map((date) => {
            const entries = (entriesByDate.get(date) ?? []).filter(
              (e) => e.startMinute != null,
            )
            const placed = packLanes(
              entries.map((e) => ({ ...e, startMinute: e.startMinute as number })),
            )
            const dayMinutes = (entriesByDate.get(date) ?? []).reduce(
              (s, e) => s + e.minutes,
              0,
            )
            const isToday = date === today
            const single = dates.length === 1
            return (
              <div
                key={date}
                className={cn(
                  "flex flex-1 flex-col border-l first:border-l-0",
                  !single && "min-w-[92px]",
                )}
              >
                {/* Column header */}
                <div
                  className={cn(
                    "flex h-8 items-center justify-center gap-1.5 border-b text-xs",
                    isToday && "text-primary font-semibold",
                  )}
                >
                  {single ? (
                    <span className="tabular-nums">
                      {dayMinutes > 0 ? formatMinutes(dayMinutes) : "No time logged"}
                    </span>
                  ) : (
                    <>
                      <span className="uppercase">{dowLabel(date)}</span>
                      <span
                        className={cn(
                          "flex size-5 items-center justify-center rounded-full tabular-nums",
                          isToday && "bg-primary text-primary-foreground",
                        )}
                      >
                        {dayOfMonth(date)}
                      </span>
                    </>
                  )}
                </div>

                {/* Column body */}
                <div
                  className={cn(
                    "relative",
                    !readOnly && "cursor-copy",
                    isToday && "bg-primary/[0.03]",
                  )}
                  style={{ height: bodyHeight }}
                  onPointerDown={(e) => {
                    if (readOnly || !onCreate) return
                    // Don't start a drag when pressing an existing block.
                    if ((e.target as HTMLElement).closest("[data-block]")) return
                    gesture.onDown(e, date)
                  }}
                  onPointerMove={gesture.onMove}
                  onPointerUp={gesture.onUp}
                  onPointerCancel={gesture.onCancel}
                >
                  {/* Hour lines */}
                  {hours.map((h, i) => (
                    <div
                      key={h}
                      className="border-border/60 absolute inset-x-0 border-t"
                      style={{ top: i * HOUR_HEIGHT }}
                    />
                  ))}
                  <div
                    className="border-border/60 absolute inset-x-0 border-t"
                    style={{ top: bodyHeight }}
                  />

                  {/* Now line */}
                  {isToday && nowVisible && (
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

                  {/* Drag-to-size preview */}
                  {drag && drag.key === date && (() => {
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

                  {/* Blocks */}
                  {placed.map(({ item, lane, lanes }) => {
                    const top = (item.startMinute! - startHour * 60) * PX_PER_MIN
                    const height = Math.max(20, item.minutes * PX_PER_MIN - 2)
                    const widthPct = 100 / lanes
                    const color = item.projectColor ?? "#64748b"
                    return (
                      <button
                        key={item._id}
                        type="button"
                        data-block
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelect?.(item)
                        }}
                        className="absolute z-10 overflow-hidden rounded-md border-l-2 px-1.5 py-1 text-left shadow-sm transition-shadow hover:z-30 hover:shadow-md"
                        style={{
                          top,
                          height,
                          left: `calc(${lane * widthPct}% + 2px)`,
                          width: `calc(${widthPct}% - 4px)`,
                          borderLeftColor: color,
                          backgroundColor: `color-mix(in srgb, ${color} 16%, var(--card))`,
                        }}
                        title={`${item.projectName}${item.taskName ? " · " + item.taskName : ""} — ${formatMinutes(item.minutes)}`}
                      >
                        <div className="truncate text-[11px] leading-tight font-medium">
                          {item.projectName}
                        </div>
                        {height > 30 && item.taskName && (
                          <div className="text-muted-foreground truncate text-[10px] leading-tight">
                            {item.taskName}
                          </div>
                        )}
                        {height > 44 && (
                          <div className="text-muted-foreground mt-0.5 text-[10px] tabular-nums">
                            {formatClock(item.startMinute!)} · {formatMinutes(item.minutes)}
                          </div>
                        )}
                      </button>
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
