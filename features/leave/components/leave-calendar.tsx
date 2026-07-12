"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { formatLeaveDates } from "@/features/leave/lib/labels"
import {
  LeaveDetailDialog,
  type LeaveDetailRow,
} from "@/features/leave/components/leave-detail-dialog"

const iso = (d: Date) => d.toISOString().slice(0, 10)
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

/** Low-opacity tint for a hex colour used as the chip background. */
function tint(color: string): string | undefined {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}26` : undefined
}

export function LeaveCalendar() {
  const now = new Date()
  const [cursor, setCursor] = React.useState({
    y: now.getUTCFullYear(),
    m: now.getUTCMonth(),
  })

  const [selected, setSelected] = React.useState<LeaveDetailRow | null>(null)
  // Mobile: tapping a day opens a sheet listing everyone out that day.
  const [dayOpen, setDayOpen] = React.useState<string | null>(null)

  const first = new Date(Date.UTC(cursor.y, cursor.m, 1))
  const last = new Date(Date.UTC(cursor.y, cursor.m + 1, 0))

  const leave = useQuery(api.leaveRequests.calendar, {
    start: iso(first),
    end: iso(last),
  })
  const holidays = useQuery(api.holidays.list, { year: cursor.y })

  const holidayByDate = new Map((holidays ?? []).map((h) => [h.date, h.name]))

  // Distinct leave types present this month, for the colour legend.
  const legend = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const r of leave ?? []) map.set(r.leaveTypeName, r.leaveTypeColor)
    return [...map.entries()]
  }, [leave])

  const leaveOn = React.useCallback(
    (date: string) =>
      (leave ?? []).filter((r) => r.startDate <= date && r.endDate >= date),
    [leave],
  )

  // Build a 6-week grid starting on the Monday on/before the 1st.
  const offset = (first.getUTCDay() + 6) % 7
  const gridStart = new Date(first)
  gridStart.setUTCDate(first.getUTCDate() - offset)
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart)
    d.setUTCDate(gridStart.getUTCDate() + i)
    return iso(d)
  })

  const monthLabel = first.toLocaleString("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })

  const todayIso = iso(new Date())

  function shift(delta: number) {
    setCursor((c) => {
      const m = c.m + delta
      return {
        y: c.y + Math.floor(m / 12),
        m: ((m % 12) + 12) % 12,
      }
    })
  }

  const dayList = dayOpen ? leaveOn(dayOpen) : []

  return (
    <div className="px-4 lg:px-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-medium sm:text-lg">{monthLabel}</h2>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" onClick={() => shift(-1)}>
            <IconChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => shift(1)}>
            <IconChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 overflow-hidden rounded-lg border text-sm">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="bg-muted/50 text-muted-foreground border-b p-1 text-center text-[10px] font-medium sm:p-2 sm:text-xs"
          >
            <span className="sm:hidden">{d[0]}</span>
            <span className="hidden sm:inline">{d}</span>
          </div>
        ))}
        {cells.map((date) => {
          const inMonth = date.slice(0, 7) === iso(first).slice(0, 7)
          const holiday = holidayByDate.get(date)
          const dayLeave = leaveOn(date)
          const isToday = date === todayIso
          return (
            <div
              key={date}
              className={cn(
                "min-h-16 border-b border-r p-1 sm:min-h-24 sm:p-1.5 [&:nth-child(7n+1)]:border-l-0",
                !inMonth && "bg-muted/30 text-muted-foreground",
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "text-xs",
                    isToday &&
                      "bg-primary text-primary-foreground flex size-5 items-center justify-center rounded-full font-semibold",
                  )}
                >
                  {Number(date.slice(-2))}
                </span>
                {holiday && (
                  <>
                    <span
                      className="size-1.5 rounded-full bg-rose-500 sm:hidden"
                      title={holiday}
                    />
                    <span
                      className="hidden truncate text-[10px] text-rose-600 sm:inline"
                      title={holiday}
                    >
                      {holiday}
                    </span>
                  </>
                )}
              </div>

              {/* Desktop: named chips */}
              <div className="mt-1 hidden flex-col gap-0.5 sm:flex">
                {dayLeave.slice(0, 3).map((r) => (
                  <button
                    key={r._id}
                    onClick={() => setSelected(r)}
                    className="flex items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] hover:brightness-95"
                    style={{ backgroundColor: tint(r.leaveTypeColor) }}
                    title={`${r.employeeName} · ${r.leaveTypeName}`}
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: r.leaveTypeColor }}
                    />
                    <span className="truncate">{r.employeeName}</span>
                  </button>
                ))}
                {dayLeave.length > 3 && (
                  <button
                    onClick={() => setDayOpen(date)}
                    className="text-muted-foreground hover:text-foreground text-left text-[10px]"
                  >
                    +{dayLeave.length - 3} more
                  </button>
                )}
              </div>

              {/* Mobile: a dot cluster; tap the day to see who's out */}
              {dayLeave.length > 0 && (
                <button
                  onClick={() => setDayOpen(date)}
                  aria-label={`${dayLeave.length} on leave, view details`}
                  className="mt-1 flex w-full flex-wrap gap-0.5 sm:hidden"
                >
                  {dayLeave.slice(0, 6).map((r) => (
                    <span
                      key={r._id}
                      className="size-1.5 rounded-full"
                      style={{ backgroundColor: r.leaveTypeColor }}
                    />
                  ))}
                  {dayLeave.length > 6 && (
                    <span className="text-muted-foreground text-[9px] leading-none">
                      +{dayLeave.length - 6}
                    </span>
                  )}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {legend.length > 0 && (
        <div className="text-muted-foreground mt-3 flex flex-wrap gap-3 text-xs">
          {legend.map(([name, color]) => (
            <span key={name} className="flex items-center gap-1.5">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: color }}
              />
              {name}
            </span>
          ))}
        </div>
      )}

      {/* Day sheet: who's on leave on the tapped day */}
      <Dialog open={dayOpen !== null} onOpenChange={(o) => !o && setDayOpen(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {dayOpen &&
                new Date(`${dayOpen}T00:00:00`).toLocaleDateString(undefined, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1">
            {dayList.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center text-sm">
                No one is on leave.
              </p>
            ) : (
              dayList.map((r) => {
                const d = formatLeaveDates(r.startDate, r.endDate)
                return (
                  <button
                    key={r._id}
                    onClick={() => {
                      setDayOpen(null)
                      setSelected(r)
                    }}
                    className="hover:bg-muted flex items-center gap-2.5 rounded-lg p-2 text-left"
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: r.leaveTypeColor }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {r.employeeName}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {r.leaveTypeName} · {d.range}
                      </span>
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      <LeaveDetailDialog
        leave={selected}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  )
}
