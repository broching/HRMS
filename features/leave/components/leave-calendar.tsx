"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const iso = (d: Date) => d.toISOString().slice(0, 10)
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export function LeaveCalendar() {
  const now = new Date()
  const [cursor, setCursor] = React.useState({
    y: now.getUTCFullYear(),
    m: now.getUTCMonth(),
  })

  const first = new Date(Date.UTC(cursor.y, cursor.m, 1))
  const last = new Date(Date.UTC(cursor.y, cursor.m + 1, 0))

  const leave = useQuery(api.leaveRequests.calendar, {
    start: iso(first),
    end: iso(last),
  })
  const holidays = useQuery(api.holidays.list, { year: cursor.y })

  const holidayByDate = new Map((holidays ?? []).map((h) => [h.date, h.name]))

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

  function shift(delta: number) {
    setCursor((c) => {
      const m = c.m + delta
      return {
        y: c.y + Math.floor(m / 12),
        m: ((m % 12) + 12) % 12,
      }
    })
  }

  return (
    <div className="px-4 lg:px-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-medium">{monthLabel}</h2>
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
            className="bg-muted/50 text-muted-foreground border-b p-2 text-center text-xs font-medium"
          >
            {d}
          </div>
        ))}
        {cells.map((date) => {
          const inMonth = date.slice(0, 7) === iso(first).slice(0, 7)
          const holiday = holidayByDate.get(date)
          const dayLeave = (leave ?? []).filter(
            (r) => r.startDate <= date && r.endDate >= date,
          )
          return (
            <div
              key={date}
              className={cn(
                "min-h-24 border-b border-r p-1.5 [&:nth-child(7n+1)]:border-l-0",
                !inMonth && "bg-muted/30 text-muted-foreground",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs">{Number(date.slice(-2))}</span>
                {holiday && (
                  <span
                    className="truncate text-[10px] text-rose-600"
                    title={holiday}
                  >
                    {holiday}
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-col gap-0.5">
                {dayLeave.slice(0, 3).map((r) => (
                  <div
                    key={r._id}
                    className="flex items-center gap-1 truncate text-[11px]"
                    title={`${r.employeeName} · ${r.leaveTypeName}`}
                  >
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: r.leaveTypeColor }}
                    />
                    <span className="truncate">{r.employeeName}</span>
                  </div>
                ))}
                {dayLeave.length > 3 && (
                  <span className="text-muted-foreground text-[10px]">
                    +{dayLeave.length - 3} more
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
