"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import {
  IconChevronLeft,
  IconChevronRight,
  IconSearch,
  IconSend,
  IconClockPlay,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  todayIso,
  addDaysIso,
  mondayOfIso,
  weekDates,
  weekRangeLabel,
  formatDayLabel,
  minutesToClock,
} from "@/features/timesheets/lib/time"
import { RosterDayGrid, type RosterPerson } from "./roster-day-grid"
import { RosterWeekGrid, type AddOpts } from "./roster-week-grid"
import { ShiftEditorDialog } from "./shift-editor-dialog"

const ALL = "__all__"

type DialogState = {
  employeeId: Id<"employees">
  employeeName: string
  date: string
  existingShift?: {
    _id: Id<"shiftAssignments">
    startTime: string
    endTime: string
    breakMinutes: number
    note: string | null
  }
  existingOvertime?: {
    _id: Id<"overtimeRecords">
    startTime: string
    endTime: string
    multiplier: number
    note: string | null
  }
  defaultType?: "shift" | "overtime"
  defaultStart?: string
  defaultEnd?: string
}

export function RosterBoard({ scope }: { scope: "team" | "org" }) {
  const [view, setView] = React.useState<"day" | "week">("week")
  const [anchor, setAnchor] = React.useState(() => todayIso())
  const [search, setSearch] = React.useState("")
  const [departmentId, setDepartmentId] = React.useState(ALL)
  const [teamId, setTeamId] = React.useState(ALL)
  const [dialog, setDialog] = React.useState<DialogState | null>(null)

  const monday = mondayOfIso(anchor)
  const weekEnd = addDaysIso(monday, 6)
  const days = weekDates(monday)

  const deptArg = departmentId === ALL ? undefined : (departmentId as Id<"departments">)
  const teamArg = teamId === ALL ? undefined : (teamId as Id<"teams">)

  const departments = useQuery(api.departments.list) ?? []
  const teams = useQuery(api.teams.list) ?? []

  const week = useQuery(
    api.schedules.rosterWeek,
    view === "week"
      ? { start: monday, end: weekEnd, scope, departmentId: deptArg, teamId: teamArg }
      : "skip",
  )
  const day = useQuery(
    api.schedules.rosterDay,
    view === "day"
      ? { date: anchor, scope, departmentId: deptArg, teamId: teamArg }
      : "skip",
  )

  const publish = useMutation(api.schedules.publishWeek)
  const scheduleOt = useMutation(api.overtime.schedule)

  // ── Filtering (client-side name search) ──
  const q = search.trim().toLowerCase()
  const weekRows = React.useMemo(() => {
    const rows = week?.rows ?? []
    if (!q) return rows
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.jobTitle ?? "").toLowerCase().includes(q),
    )
  }, [week, q])
  const dayPeople = React.useMemo(() => {
    const people = day?.people ?? []
    if (!q) return people
    return people.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.jobTitle ?? "").toLowerCase().includes(q),
    )
  }, [day, q])

  const loading = view === "week" ? week === undefined : day === undefined

  function step(dir: number) {
    setAnchor((a) => addDaysIso(a, dir * (view === "week" ? 7 : 1)))
  }

  async function handlePublish() {
    try {
      const res = await publish({ start: monday, end: weekEnd, scope })
      toast.success(
        res.published > 0
          ? `Published ${res.published} shift${res.published === 1 ? "" : "s"}`
          : "Nothing to publish",
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't publish")
    }
  }

  // ── Dialog openers ──
  const openAdd = (
    employeeId: Id<"employees">,
    employeeName: string,
    date: string,
    opts?: AddOpts,
  ) => setDialog({ employeeId, employeeName, date, ...opts })

  async function confirmSuggestion(person: RosterPerson) {
    if (!person.otSuggestion) return
    try {
      await scheduleOt({
        employeeId: person.employeeId,
        date: anchor,
        startTime: person.otSuggestion.startTime,
        endTime: person.otSuggestion.endTime,
      })
      toast.success("Overtime scheduled")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't schedule OT")
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => v && setView(v as "day" | "week")}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="day">Day</ToggleGroupItem>
            <ToggleGroupItem value="week">Week</ToggleGroupItem>
          </ToggleGroup>
          <div className="flex items-center rounded-lg border">
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-r-none"
              onClick={() => step(-1)}
              aria-label="Previous"
            >
              <IconChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-l-none border-l"
              onClick={() => step(1)}
              aria-label="Next"
            >
              <IconChevronRight className="size-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => setAnchor(todayIso())}>
            Today
          </Button>
          <span className="ml-1 text-sm font-semibold">
            {view === "week" ? weekRangeLabel(monday) : formatDayLabel(anchor)}
          </span>
        </div>
        {view === "week" && (
          <Button onClick={handlePublish} disabled={(week?.draftCount ?? 0) === 0}>
            <IconSend className="size-4" />
            Publish week{week && week.draftCount > 0 ? ` (${week.draftCount})` : ""}
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <IconSearch className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search people"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={departmentId} onValueChange={setDepartmentId}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="All departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d._id} value={d._id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={teamId} onValueChange={setTeamId}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="All teams" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All teams</SelectItem>
            {teams.map((t) => (
              <SelectItem key={t._id} value={t._id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <PendingOvertimePanel />

      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : view === "week" ? (
        weekRows.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <p className="text-muted-foreground text-xs">
              Dashed shifts come from each person&apos;s work pattern — click to
              override. Amber = overtime. Publish to release the week.
            </p>
            <RosterWeekGrid
              rows={weekRows}
              days={days}
              onAdd={openAdd}
              onEditShift={(employeeId, employeeName, date, s) =>
                setDialog({
                  employeeId,
                  employeeName,
                  date,
                  existingShift: {
                    _id: s.shiftId!,
                    startTime: s.startTime,
                    endTime: s.endTime,
                    breakMinutes: s.breakMinutes,
                    note: s.note,
                  },
                })
              }
              onEditOvertime={(employeeId, employeeName, date, o) =>
                setDialog({
                  employeeId,
                  employeeName,
                  date,
                  existingOvertime: {
                    _id: o.overtimeId,
                    startTime: o.startTime ?? "18:00",
                    endTime: o.endTime ?? "20:00",
                    multiplier: o.multiplier,
                    note: null,
                  },
                })
              }
            />
          </>
        )
      ) : dayPeople.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <p className="text-muted-foreground text-xs">
            Drag a column to add a shift or overtime. Solid bars are actual
            clocked attendance overlaid on the schedule.
          </p>
          <Card className="gap-0 overflow-hidden p-0">
            <RosterDayGrid
              date={anchor}
              people={dayPeople}
              onAdd={(person, start, end) =>
                openAdd(person.employeeId, person.name, anchor, {
                  defaultStart: minutesToClock(start),
                  defaultEnd: minutesToClock(end),
                })
              }
              onEditShift={(person, b) =>
                b.shiftId &&
                setDialog({
                  employeeId: person.employeeId,
                  employeeName: person.name,
                  date: anchor,
                  existingShift: {
                    _id: b.shiftId,
                    startTime: b.startTime ?? "09:00",
                    endTime: b.endTime ?? "17:00",
                    breakMinutes: b.breakMinutes ?? 0,
                    note: b.note,
                  },
                })
              }
              onEditOvertime={(person, b) =>
                b.overtimeId &&
                setDialog({
                  employeeId: person.employeeId,
                  employeeName: person.name,
                  date: anchor,
                  existingOvertime: {
                    _id: b.overtimeId,
                    startTime: b.startTime ?? "18:00",
                    endTime: b.endTime ?? "20:00",
                    multiplier: b.multiplier ?? 1.5,
                    note: b.note,
                  },
                })
              }
              onConfirmOt={confirmSuggestion}
            />
          </Card>
        </>
      )}

      {dialog && (
        <ShiftEditorDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          employeeId={dialog.employeeId}
          employeeName={dialog.employeeName}
          date={dialog.date}
          existingShift={dialog.existingShift}
          existingOvertime={dialog.existingOvertime}
          defaultType={dialog.defaultType}
          defaultStart={dialog.defaultStart}
          defaultEnd={dialog.defaultEnd}
        />
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
      <IconClockPlay className="text-muted-foreground size-8" stroke={1.5} />
      <p className="text-muted-foreground text-sm">No one to schedule here.</p>
      <p className="text-muted-foreground text-xs">
        HR can add employees; managers can schedule their direct reports.
      </p>
    </div>
  )
}

// Scheduled overtime awaiting confirmation as worked → eligible for payroll pull.
function PendingOvertimePanel() {
  const list = useQuery(api.overtime.reviewList)
  const approve = useMutation(api.overtime.approve)
  const reject = useMutation(api.overtime.reject)
  const [open, setOpen] = React.useState(false)

  const pending = (list ?? []).filter((o) => o.status === "scheduled")
  if (pending.length === 0) return null

  return (
    <Card className="gap-0 p-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="hover:bg-accent/50 flex w-full items-center justify-between rounded-t-xl px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <IconClockPlay className="size-4 text-amber-500" />
          Overtime to confirm
          <Badge variant="secondary">{pending.length}</Badge>
        </span>
        <span className="text-muted-foreground text-xs">
          {open ? "Hide" : "Review"}
        </span>
      </button>
      {open && (
        <div className="flex flex-col divide-y border-t">
          {pending.map((o) => (
              <div key={o._id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <div className="flex-1">
                  <div className="font-medium">{o.employeeName}</div>
                  <div className="text-muted-foreground text-xs tabular-nums">
                    {o.date}
                    {o.startTime && o.endTime ? ` · ${o.startTime}–${o.endTime}` : ""} ·{" "}
                    {o.plannedHours}h × {o.multiplier}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    try {
                      await reject({ overtimeId: o._id })
                      toast.success("Overtime rejected")
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Couldn't reject")
                    }
                  }}
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      await approve({ overtimeId: o._id })
                      toast.success("Overtime approved")
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Couldn't approve")
                    }
                  }}
                >
                  Approve
                </Button>
              </div>
          ))}
        </div>
      )}
    </Card>
  )
}
