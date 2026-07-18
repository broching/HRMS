"use client"

import * as React from "react"
import type { FunctionReturnType } from "convex/server"
import { IconPlus } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { cn } from "@/lib/utils"
import { parseIso } from "@/features/timesheets/lib/time"

type Week = FunctionReturnType<typeof api.schedules.rosterWeek>
type Row = Week["rows"][number]
type Day = Row["days"][number]
type Shift = Day["shifts"][number]
type Overtime = Day["overtime"][number]

export type AddOpts = {
  defaultType?: "shift" | "overtime"
  defaultStart?: string
  defaultEnd?: string
}

function shortDay(iso: string) {
  const d = parseIso(iso)
  return {
    dow: d.toLocaleDateString(undefined, { weekday: "short" }),
    num: d.getDate(),
    isToday: iso === new Date().toISOString().slice(0, 10),
  }
}

export function RosterWeekGrid({
  rows,
  days,
  onAdd,
  onEditShift,
  onEditOvertime,
}: {
  rows: Row[]
  days: string[]
  onAdd: (
    employeeId: Id<"employees">,
    employeeName: string,
    date: string,
    opts?: AddOpts,
  ) => void
  onEditShift: (
    employeeId: Id<"employees">,
    employeeName: string,
    date: string,
    shift: Shift,
  ) => void
  onEditOvertime: (
    employeeId: Id<"employees">,
    employeeName: string,
    date: string,
    ot: Overtime,
  ) => void
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/50">
            <th className="bg-muted/50 sticky left-0 z-10 min-w-[170px] px-3 py-2 text-left font-medium">
              Employee
            </th>
            {days.map((iso) => {
              const { dow, num, isToday } = shortDay(iso)
              return (
                <th
                  key={iso}
                  className={cn(
                    "min-w-[128px] px-2 py-2 text-center font-medium",
                    isToday && "text-primary",
                  )}
                >
                  <div>{dow}</div>
                  <div className="text-muted-foreground text-xs">{num}</div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.employeeId} className="border-t">
              <td className="bg-background sticky left-0 z-10 px-3 py-2 align-top">
                <div className="font-medium">{row.name}</div>
                <div className="text-muted-foreground text-xs">
                  {row.jobTitle ?? (row.payType === "hourly" ? "Hourly" : "Salaried")}
                  {row.workPatternName ? ` · ${row.workPatternName}` : ""}
                </div>
              </td>
              {row.days.map((day) => (
                <td key={day.date} className="border-l px-1.5 py-1.5 align-top">
                  <div className="flex flex-col gap-1">
                    {day.off && day.shifts.length === 0 && (
                      <span className="text-muted-foreground/60 px-1 text-[11px]">Off</span>
                    )}
                    {day.shifts.map((s, i) => (
                      <button
                        key={s.shiftId ?? `d${i}`}
                        onClick={() =>
                          s.shiftId
                            ? onEditShift(row.employeeId, row.name, day.date, s)
                            : onAdd(row.employeeId, row.name, day.date, {
                                defaultType: "shift",
                                defaultStart: s.startTime,
                                defaultEnd: s.endTime,
                              })
                        }
                        className={cn(
                          "flex items-center gap-1.5 rounded-md border px-2 py-1 text-left text-xs hover:bg-accent",
                          s.derived && "border-dashed opacity-70",
                          s.status === "draft" && !s.derived && "border-dashed",
                        )}
                        style={{ borderLeftColor: s.color, borderLeftWidth: 3 }}
                        title={s.derived ? "From work pattern — click to override" : undefined}
                      >
                        <span className="tabular-nums">
                          {s.startTime}–{s.endTime}
                        </span>
                        {s.derived && <span className="text-muted-foreground">·pattern</span>}
                        {s.status === "draft" && !s.derived && (
                          <span className="text-muted-foreground">·draft</span>
                        )}
                      </button>
                    ))}
                    {day.overtime.map((o) => (
                      <button
                        key={o.overtimeId}
                        onClick={() => onEditOvertime(row.employeeId, row.name, day.date, o)}
                        className="flex items-center gap-1 rounded-md border border-amber-500/70 bg-amber-400/15 px-2 py-1 text-left text-xs text-amber-800 hover:bg-amber-400/30 dark:text-amber-200"
                        title="Scheduled overtime"
                      >
                        <span className="tabular-nums">
                          {o.startTime && o.endTime
                            ? `OT ${o.startTime}–${o.endTime}`
                            : `OT ${o.plannedHours}h`}
                        </span>
                        {o.status === "approved" && (
                          <span className="opacity-70">·ok</span>
                        )}
                      </button>
                    ))}
                    <button
                      onClick={() => onAdd(row.employeeId, row.name, day.date)}
                      className="text-muted-foreground hover:text-foreground hover:border-border flex items-center justify-center rounded-md border border-transparent py-1"
                      aria-label="Add to roster"
                    >
                      <IconPlus className="size-3.5" />
                    </button>
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
