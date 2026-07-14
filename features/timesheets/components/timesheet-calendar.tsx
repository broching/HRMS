"use client"

import * as React from "react"
import { IconUsers } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import {
  todayIso,
  mondayOfIso,
  weekDates,
  monthGrid,
  sameMonth,
  dayOfMonth,
  dowLabel,
  formatHoursDecimal,
} from "@/features/timesheets/lib/time"

export type DayDatum = { minutes: number; people?: number; entries?: number }

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

/**
 * A month/week calendar coloured by how much time was logged each day. Shared by
 * the Team dashboard and the HR-Lounge report so both read identically. Intensity
 * is scaled against the busiest day in view.
 */
export function TimesheetCalendar({
  mode,
  anchor,
  data,
  onPickDay,
  accent = "var(--primary)",
}: {
  mode: "week" | "month"
  anchor: string
  data: Map<string, DayDatum>
  onPickDay?: (date: string) => void
  accent?: string
}) {
  const today = todayIso()
  const peak = React.useMemo(() => {
    let max = 0
    for (const d of data.values()) if (d.minutes > max) max = d.minutes
    return Math.max(max, 60)
  }, [data])

  const weeks: string[][] =
    mode === "month" ? monthGrid(anchor) : [weekDates(mondayOfIso(anchor))]

  function Cell({ date }: { date: string }) {
    const datum = data.get(date)
    const minutes = datum?.minutes ?? 0
    const inMonth = mode === "week" || sameMonth(date, anchor)
    const isToday = date === today
    const intensity = minutes > 0 ? 0.12 + 0.68 * Math.min(1, minutes / peak) : 0
    const clickable = !!onPickDay
    const Tag = clickable ? "button" : "div"
    return (
      <Tag
        {...(clickable ? { type: "button" as const, onClick: () => onPickDay!(date) } : {})}
        className={cn(
          "relative flex flex-col gap-1 border-r border-b p-1.5 text-left transition-colors last:border-r-0",
          mode === "week" ? "min-h-[120px]" : "min-h-[84px]",
          clickable && "hover:bg-accent/40 cursor-pointer",
          !inMonth && "bg-muted/20 text-muted-foreground",
        )}
      >
        <div className="flex items-center justify-between">
          {mode === "week" ? (
            <span className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-[11px] uppercase">
                {dowLabel(date)}
              </span>
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                  isToday && "bg-primary text-primary-foreground font-semibold",
                )}
              >
                {dayOfMonth(date)}
              </span>
            </span>
          ) : (
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                isToday && "bg-primary text-primary-foreground font-semibold",
              )}
            >
              {dayOfMonth(date)}
            </span>
          )}
          {minutes > 0 && (
            <span className="text-[11px] font-semibold tabular-nums">
              {formatHoursDecimal(minutes)}
            </span>
          )}
        </div>

        {minutes > 0 && (
          <div
            className="mt-auto rounded-md px-1.5 py-1"
            style={{
              backgroundColor: `color-mix(in srgb, ${accent} ${Math.round(
                intensity * 100,
              )}%, transparent)`,
            }}
          >
            {datum?.people != null && (
              <span className="flex items-center gap-1 text-[11px] font-medium tabular-nums">
                <IconUsers className="size-3" />
                {datum.people}
                <span className="text-muted-foreground font-normal">
                  {datum.people === 1 ? "person" : "people"}
                </span>
              </span>
            )}
          </div>
        )}
      </Tag>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="text-muted-foreground grid grid-cols-7 border-b text-center text-[11px] font-medium tracking-wide uppercase">
        {DOW.map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div>
        {weeks.map((week, wi) => (
          <div
            key={wi}
            className="grid grid-cols-7 last:[&>*]:border-b-0 [&>*:last-child]:border-r-0"
          >
            {week.map((date) => (
              <Cell key={date} date={date} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
