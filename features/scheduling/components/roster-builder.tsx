"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import {
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconSend,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  AssignShiftDialog,
  type EditingShift,
} from "./assign-shift-dialog"
import {
  mondayOf,
  weekDates,
  isoDate,
  addDays,
  shortDay,
  isSameDay,
} from "@/features/scheduling/lib/dates"

type RosterRow = {
  _id: Id<"shiftAssignments">
  employeeId: Id<"employees">
  date: string
  startTime: string
  endTime: string
  breakMinutes: number
  color: string
  status: "draft" | "published" | "cancelled"
  note: string | null
}

type DialogState = {
  open: boolean
  employeeId: Id<"employees">
  employeeName: string
  date: string
  existing?: EditingShift
}

export function RosterBuilder() {
  const [monday, setMonday] = React.useState(() => mondayOf(new Date()))
  const days = weekDates(monday)
  const start = isoDate(monday)
  const end = isoDate(addDays(monday, 6))

  const employees = useQuery(api.schedules.schedulableEmployees)
  const assignments = useQuery(api.schedules.roster, { start, end }) as
    | RosterRow[]
    | undefined
  const publish = useMutation(api.schedules.publishWeek)

  const [dialog, setDialog] = React.useState<DialogState | null>(null)

  // Group assignments by "employeeId|date".
  const byCell = React.useMemo(() => {
    const map = new Map<string, RosterRow[]>()
    for (const a of assignments ?? []) {
      const key = `${a.employeeId}|${a.date}`
      const arr = map.get(key) ?? []
      arr.push(a)
      map.set(key, arr)
    }
    return map
  }, [assignments])

  const draftCount = (assignments ?? []).filter(
    (a) => a.status === "draft",
  ).length

  async function handlePublish() {
    try {
      const res = await publish({ start, end })
      toast.success(
        res.published > 0
          ? `Published ${res.published} shift${res.published === 1 ? "" : "s"}`
          : "No draft shifts to publish",
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't publish")
    }
  }

  const weekLabel = `${monday.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  })} – ${addDays(monday, 6).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  })}`

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setMonday(addDays(monday, -7))}
            aria-label="Previous week"
          >
            <IconChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMonday(mondayOf(new Date()))}
          >
            This week
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setMonday(addDays(monday, 7))}
            aria-label="Next week"
          >
            <IconChevronRight className="size-4" />
          </Button>
          <span className="ml-2 text-sm font-medium">{weekLabel}</span>
        </div>
        <Button onClick={handlePublish} disabled={draftCount === 0}>
          <IconSend className="size-4" />
          Publish week{draftCount > 0 ? ` (${draftCount})` : ""}
        </Button>
      </div>

      {employees === undefined ? (
        <Skeleton className="h-72 w-full" />
      ) : employees.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No employees to schedule. HR can add employees, or managers can
          schedule their direct reports.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left font-medium min-w-[160px]">
                  Employee
                </th>
                {days.map((d) => (
                  <th
                    key={isoDate(d)}
                    className={cn(
                      "px-2 py-2 text-center font-medium min-w-[120px]",
                      isSameDay(d, new Date()) && "text-primary",
                    )}
                  >
                    <div>{shortDay(d)}</div>
                    <div className="text-muted-foreground text-xs">
                      {d.getDate()}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp._id} className="border-t">
                  <td className="bg-background sticky left-0 z-10 px-3 py-2 align-top">
                    <div className="font-medium">{emp.name}</div>
                    {emp.positionTitle && (
                      <div className="text-muted-foreground text-xs">
                        {emp.positionTitle}
                      </div>
                    )}
                  </td>
                  {days.map((d) => {
                    const date = isoDate(d)
                    const cell = byCell.get(`${emp._id}|${date}`) ?? []
                    return (
                      <td
                        key={date}
                        className="border-l px-1.5 py-1.5 align-top"
                      >
                        <div className="flex flex-col gap-1">
                          {cell.map((a) => (
                            <button
                              key={a._id}
                              onClick={() =>
                                setDialog({
                                  open: true,
                                  employeeId: emp._id,
                                  employeeName: emp.name,
                                  date,
                                  existing: {
                                    _id: a._id,
                                    startTime: a.startTime,
                                    endTime: a.endTime,
                                    breakMinutes: a.breakMinutes,
                                    note: a.note,
                                  },
                                })
                              }
                              className={cn(
                                "flex items-center gap-1.5 rounded-md border px-2 py-1 text-left text-xs hover:bg-accent",
                                a.status === "draft" && "border-dashed",
                              )}
                              style={{ borderLeftColor: a.color, borderLeftWidth: 3 }}
                            >
                              <span className="tabular-nums">
                                {a.startTime}–{a.endTime}
                              </span>
                              {a.status === "draft" && (
                                <span className="text-muted-foreground">·draft</span>
                              )}
                            </button>
                          ))}
                          <button
                            onClick={() =>
                              setDialog({
                                open: true,
                                employeeId: emp._id,
                                employeeName: emp.name,
                                date,
                              })
                            }
                            className="text-muted-foreground hover:text-foreground hover:border-border flex items-center justify-center rounded-md border border-transparent py-1"
                            aria-label="Add shift"
                          >
                            <IconPlus className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialog && (
        <AssignShiftDialog
          open={dialog.open}
          onOpenChange={(o) =>
            setDialog((cur) => (cur ? { ...cur, open: o } : null))
          }
          employeeId={dialog.employeeId}
          employeeName={dialog.employeeName}
          date={dialog.date}
          existing={dialog.existing}
        />
      )}
    </div>
  )
}
