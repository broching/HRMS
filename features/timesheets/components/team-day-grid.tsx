"use client"

import * as React from "react"
import type { FunctionReturnType } from "convex/server"
import { api } from "@/convex/_generated/api"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
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

type Day = FunctionReturnType<typeof api.timeEntries.teamDay>
type Person = Day["people"][number]
type Entry = Person["entries"][number]

// Drag-to-select snaps to whole hours, matching the personal grid; the edit form
// offers finer control.
const SNAP = 60 // minutes

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")
}

/**
 * A single-day, hour-by-hour board with one column per person, so a manager (or
 * HR) can see what everyone was doing at any given time slot. Mirrors the
 * geometry of the personal `TimeGrid`, but columns are people rather than dates.
 * Timed entries render as blocks; unscheduled ones surface as a header note.
 * Clicking anywhere in a column opens that person's day detail.
 */
export function TeamDayGrid({
  date,
  people,
  onSelectPerson,
  canLogFor,
  onLog,
  onEditEntry,
}: {
  date: string
  people: Person[]
  onSelectPerson: (p: Person) => void
  // Whether the caller may create/edit time for a given person's column. When
  // true, the column becomes drag-to-log and its blocks open the edit dialog.
  canLogFor?: (employeeId: string) => boolean
  onLog?: (
    person: Person,
    date: string,
    minute: number,
    minutes?: number,
  ) => void
  onEditEntry?: (person: Person, entry: Entry) => void
}) {
  const isToday = date === todayIso()

  // Shared visible window across every column.
  const timed = React.useMemo(() => {
    const all: { startMinute: number; minutes: number }[] = []
    for (const p of people) {
      for (const e of p.entries) {
        if (e.startMinute != null)
          all.push({ startMinute: e.startMinute, minutes: e.minutes })
      }
    }
    return all
  }, [people])

  const { startHour, endHour } = gridBounds(timed)
  const hours = React.useMemo(
    () => Array.from({ length: endHour - startHour }, (_, i) => startHour + i),
    [startHour, endHour],
  )
  const bodyHeight = (endHour - startHour) * HOUR_HEIGHT

  // Live "now" line, only meaningful when viewing today.
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
  const nowVisible = isToday && nowMin >= startHour * 60 && nowMin <= endHour * 60
  const nowTop = (nowMin - startHour * 60) * PX_PER_MIN

  // Drag to size on mouse; tap to log on touch (scrolling stays native).
  const gesture = useLogGesture(
    (clientY, rect) => {
      const raw = startHour * 60 + (clientY - rect.top) / PX_PER_MIN
      const snapped = Math.round(raw / SNAP) * SNAP
      return Math.max(0, Math.min(24 * 60, snapped))
    },
    (employeeId, fromMin, toMin) => {
      if (!onLog) return
      const person = people.find((p) => p.employeeId === employeeId)
      if (!person) return
      const lo = Math.min(fromMin, toMin)
      const hi = Math.max(fromMin, toMin)
      const span = hi - lo
      const start = Math.min(lo, 24 * 60 - SNAP)
      if (span < SNAP) onLog(person, date, start)
      else onLog(person, date, start, Math.min(span, 24 * 60 - start))
    },
  )
  const drag = gesture.drag

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
            const timedEntries = person.entries.filter(
              (e) => e.startMinute != null,
            )
            const untimed = person.entries.length - timedEntries.length
            const placed = packLanes(
              timedEntries.map((e) => ({
                ...e,
                startMinute: e.startMinute as number,
              })),
            )
            const logging = !!onLog && !!canLogFor?.(person.employeeId)
            return (
              <div
                key={person.employeeId}
                className="flex min-w-[140px] flex-1 flex-col border-l first:border-l-0"
              >
                {/* Column header */}
                <button
                  type="button"
                  onClick={() => onSelectPerson(person)}
                  className="hover:bg-accent/40 flex h-16 items-center gap-2 border-b px-2 text-left transition-colors"
                  title={`${person.name} — ${formatMinutes(person.minutes)}`}
                >
                  <Avatar className="size-7 shrink-0">
                    <AvatarFallback
                      className="text-[10px] font-medium"
                      style={
                        person.color
                          ? {
                              backgroundColor: `color-mix(in srgb, ${person.color} 18%, transparent)`,
                            }
                          : undefined
                      }
                    >
                      {initials(person.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold">
                      {person.name}
                    </div>
                    <div className="text-muted-foreground flex items-center gap-1.5 text-[11px] tabular-nums">
                      <span>{formatMinutes(person.minutes)}</span>
                      {untimed > 0 && (
                        <span className="text-muted-foreground/80">
                          · {untimed} untimed
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                {/* Column body */}
                <div
                  className={cn(
                    "relative",
                    logging && "cursor-copy",
                    isToday && "bg-primary/[0.03]",
                  )}
                  style={{ height: bodyHeight }}
                  onPointerDown={
                    logging
                      ? (e) => {
                          // Don't start a drag when pressing an existing block.
                          if ((e.target as HTMLElement).closest("[data-block]")) return
                          gesture.onDown(e, person.employeeId)
                        }
                      : undefined
                  }
                  onPointerMove={logging ? gesture.onMove : undefined}
                  onPointerUp={logging ? gesture.onUp : undefined}
                  onPointerCancel={logging ? gesture.onCancel : undefined}
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

                  {/* Drag-to-size preview */}
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

                  {/* Blocks */}
                  {placed.map(({ item, lane, lanes }) => {
                    const top =
                      (item.startMinute! - startHour * 60) * PX_PER_MIN
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
                          if (logging) onEditEntry?.(person, item)
                          else onSelectPerson(person)
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
                        title={blockTitle(item)}
                      >
                        <div className="truncate text-[11px] leading-tight font-medium">
                          {item.projectName}
                        </div>
                        {height > 30 && item.taskName && (
                          <div className="text-muted-foreground truncate text-[10px] leading-tight">
                            {item.taskName}
                          </div>
                        )}
                        {height > 44 && item.description && (
                          <div className="text-muted-foreground truncate text-[10px] leading-tight">
                            {item.description}
                          </div>
                        )}
                        {height > 58 && (
                          <div className="text-muted-foreground mt-0.5 text-[10px] tabular-nums">
                            {formatClock(item.startMinute!)} ·{" "}
                            {formatMinutes(item.minutes)}
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

function blockTitle(e: Entry): string {
  const parts = [e.projectName]
  if (e.taskName) parts.push(e.taskName)
  let s = parts.join(" · ")
  s += ` — ${formatClock(e.startMinute!)} · ${formatMinutes(e.minutes)}`
  if (e.description) s += `\n${e.description}`
  return s
}
