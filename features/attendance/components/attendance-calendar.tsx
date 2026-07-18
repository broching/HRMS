"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import {
  IconChevronLeft,
  IconChevronRight,
  IconSearch,
  IconUsers,
  IconClockHour4,
  IconUserCheck,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  todayIso,
  addDaysIso,
  formatDayLabel,
  formatMinutes,
  minutesToClock,
} from "@/features/timesheets/lib/time"
import { AttendanceDayGrid } from "@/features/attendance/components/attendance-day-grid"
import { AttendanceRecordDialog } from "@/features/attendance/components/attendance-record-dialog"
import {
  ManagerAdjustDialog,
  type AdjustPrefill,
} from "@/features/attendance/components/manager-adjust-dialog"

const ALL = "__all__"

type BoardPerson = NonNullable<
  ReturnType<typeof useQuery<typeof api.attendance.attendanceDayBoard>>
>["people"][number]
type SelectedBlock = { person: BoardPerson; block: BoardPerson["blocks"][number] }

export function AttendanceCalendar({ scope }: { scope: "team" | "org" }) {
  const [anchor, setAnchor] = React.useState(() => todayIso())
  const [search, setSearch] = React.useState("")
  const [departmentId, setDepartmentId] = React.useState(ALL)
  const [teamId, setTeamId] = React.useState(ALL)
  const [addDraft, setAddDraft] = React.useState<AdjustPrefill | null>(null)
  const [selected, setSelected] = React.useState<SelectedBlock | null>(null)

  const departments = useQuery(api.departments.list) ?? []
  const teams = useQuery(api.teams.list) ?? []

  const board = useQuery(api.attendance.attendanceDayBoard, {
    date: anchor,
    scope,
    departmentId: departmentId === ALL ? undefined : (departmentId as Id<"departments">),
    teamId: teamId === ALL ? undefined : (teamId as Id<"teams">),
  })

  const people = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    const all = board?.people ?? []
    if (!q) return all
    return all.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.jobTitle ?? "").toLowerCase().includes(q),
    )
  }, [board, search])

  const loading = board === undefined
  const totalMinutes = people.reduce((s, p) => s + p.totalMinutes, 0)
  const clockedIn = people.filter((p) => p.blocks.length > 0).length

  const kpis = [
    { label: "Clocked in", value: `${clockedIn}/${people.length}`, icon: IconUsers },
    {
      label: "Currently in",
      value: String(people.filter((p) => p.open).length),
      icon: IconUserCheck,
    },
    { label: "Total hours", value: formatMinutes(totalMinutes), icon: IconClockHour4 },
  ]

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border">
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-r-none"
              onClick={() => setAnchor(addDaysIso(anchor, -1))}
              aria-label="Previous day"
            >
              <IconChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-l-none border-l"
              onClick={() => setAnchor(addDaysIso(anchor, 1))}
              aria-label="Next day"
            >
              <IconChevronRight className="size-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => setAnchor(todayIso())}>
            Today
          </Button>
          <div className="ml-1 text-sm font-semibold">{formatDayLabel(anchor)}</div>
        </div>
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

      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : people.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <IconClockHour4 className="text-muted-foreground size-8" stroke={1.5} />
          <p className="text-muted-foreground text-sm">
            No attendance to show for this day
            {scope === "team" ? " in your team." : "."}
          </p>
          <p className="text-muted-foreground text-xs">
            People who must clock in appear here — mark them Required in settings.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {kpis.map((k) => (
              <Card key={k.label} className="gap-0 p-4">
                <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <k.icon className="size-3.5" />
                  <span className="truncate">{k.label}</span>
                </div>
                <div className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">
                  {k.value}
                </div>
              </Card>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            <span className="pointer-coarse:hidden">
              Drag on a column to record attendance for that person.
            </span>
            <span className="pointer-fine:hidden">
              Tap a column at a time to record attendance — adjust the exact
              times in the dialog.
            </span>
          </p>
          <Card className="gap-0 overflow-hidden p-0">
            <AttendanceDayGrid
              date={anchor}
              people={people}
              onAdd={(person, start, end) =>
                setAddDraft({
                  employeeId: person.employeeId,
                  date: anchor,
                  inTime: minutesToClock(start),
                  outTime: minutesToClock(end),
                })
              }
              onSelectBlock={(person, block) => setSelected({ person, block })}
            />
          </Card>
        </>
      )}

      <ManagerAdjustDialog
        open={addDraft !== null}
        onOpenChange={(o) => !o && setAddDraft(null)}
        prefill={addDraft ?? undefined}
      />

      {selected && (
        <AttendanceRecordDialog
          open={selected !== null}
          onOpenChange={(o) => !o && setSelected(null)}
          block={selected.block}
          employeeId={selected.person.employeeId}
          employeeName={selected.person.name}
          date={anchor}
        />
      )}
    </div>
  )
}
