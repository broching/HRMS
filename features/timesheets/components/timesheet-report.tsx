"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import {
  IconDownload,
  IconReportAnalytics,
  IconSearch,
  IconLayoutList,
  IconCalendarMonth,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import {
  todayIso,
  mondayOfIso,
  addDaysIso,
  addMonthsIso,
  monthRange,
  monthLabel,
  formatMinutes,
  minutesToHours,
} from "@/features/timesheets/lib/time"
import {
  TimesheetCalendar,
  type DayDatum,
} from "@/features/timesheets/components/timesheet-calendar"

type Row = FunctionReturnType<typeof api.timeEntries.orgReport>[number]
const ALL = "__all__"

type Preset = "week" | "month" | "last30" | "custom"
type Tab = "table" | "calendar"

function presetRange(preset: Preset, custom: { from: string; to: string }) {
  const today = todayIso()
  if (preset === "week") {
    const monday = mondayOfIso(today)
    return { from: monday, to: addDaysIso(monday, 6) }
  }
  if (preset === "month") return monthRange(today)
  if (preset === "last30") return { from: addDaysIso(today, -29), to: today }
  return custom
}

// First-of-month anchors spanning [from, to], so the calendar renders one grid
// per month regardless of how wide the range is.
function monthsInRange(from: string, to: string): string[] {
  const out: string[] = []
  let cur = `${from.slice(0, 7)}-01`
  let guard = 0
  while (cur <= to && guard < 24) {
    out.push(cur)
    cur = addMonthsIso(cur, 1)
    guard++
  }
  return out
}

function csvCell(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function TimesheetReport() {
  const [preset, setPreset] = React.useState<Preset>("month")
  const [custom, setCustom] = React.useState({
    from: monthRange(todayIso()).from,
    to: todayIso(),
  })
  const [projectId, setProjectId] = React.useState<string>(ALL)
  const [departmentId, setDepartmentId] = React.useState<string>(ALL)
  const [teamId, setTeamId] = React.useState<string>(ALL)
  const [search, setSearch] = React.useState("")
  const [tab, setTab] = React.useState<Tab>("table")

  const range = presetRange(preset, custom)
  const filters = {
    projectId: projectId === ALL ? undefined : (projectId as Id<"projects">),
    departmentId:
      departmentId === ALL ? undefined : (departmentId as Id<"departments">),
    teamId: teamId === ALL ? undefined : (teamId as Id<"teams">),
  }

  const projects = useQuery(api.projects.list) ?? []
  const departments = useQuery(api.departments.list) ?? []
  const teams = useQuery(api.teams.list) ?? []
  const rows = useQuery(api.timeEntries.orgReport, {
    from: range.from,
    to: range.to,
    ...filters,
  })
  const calendar = useQuery(
    api.timeEntries.orgCalendar,
    tab === "calendar" ? { from: range.from, to: range.to, ...filters } : "skip",
  )

  // Search narrows the table rows to matching people (client-side).
  const visibleRows = React.useMemo(() => {
    const list = rows ?? []
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter((r) => r.employeeName.toLowerCase().includes(q))
  }, [rows, search])

  const totals = React.useMemo(() => {
    const list = visibleRows
    const minutes = list.reduce((s, r) => s + r.minutes, 0)
    const entries = list.reduce((s, r) => s + r.entries, 0)
    const people = new Set(list.map((r) => r.employeeId)).size
    const projectsUsed = new Set(list.map((r) => r.projectId)).size
    return { minutes, entries, people, projectsUsed }
  }, [visibleRows])

  const calendarData = React.useMemo(() => {
    const m = new Map<string, DayDatum>()
    for (const d of calendar?.days ?? []) {
      m.set(d.date, { minutes: d.minutes, people: d.people, entries: d.entries })
    }
    return m
  }, [calendar])

  function exportCsv() {
    if (visibleRows.length === 0) {
      toast.error("Nothing to export for these filters.")
      return
    }
    const header = ["Employee", "Project", "Entries", "Hours", "Minutes"]
    const lines = [header.map(csvCell).join(",")]
    for (const r of visibleRows) {
      lines.push(
        [
          csvCell(r.employeeName),
          csvCell(r.projectName),
          csvCell(r.entries),
          csvCell(minutesToHours(r.minutes)),
          csvCell(r.minutes),
        ].join(","),
      )
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `timesheet-${range.from}_to_${range.to}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Report exported")
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-6 lg:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <IconReportAnalytics className="size-5" />
            Timesheet report
          </h1>
          <p className="text-muted-foreground text-sm">
            Hours logged across the whole organisation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            value={tab}
            onValueChange={(v) => v && setTab(v as Tab)}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="table" className="px-3" aria-label="Table">
              <IconLayoutList className="size-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="calendar" className="px-3" aria-label="Calendar">
              <IconCalendarMonth className="size-4" />
            </ToggleGroupItem>
          </ToggleGroup>
          <Button onClick={exportCsv} disabled={visibleRows.length === 0}>
            <IconDownload className="size-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="gap-3 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Range</Label>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["week", "This week"],
                  ["month", "This month"],
                  ["last30", "Last 30 days"],
                  ["custom", "Custom"],
                ] as [Preset, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPreset(key)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    preset === key
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "hover:bg-accent border-input",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {preset === "custom" && (
            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">From</Label>
                <Input
                  type="date"
                  value={custom.from}
                  onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">To</Label>
                <Input
                  type="date"
                  value={custom.to}
                  onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-4">
          <div className="relative lg:max-w-xs lg:flex-1">
            <Label className="text-xs">Search</Label>
            <div className="relative mt-1.5">
              <IconSearch className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                placeholder="Employee name"
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5 lg:w-48">
            <Label className="text-xs">Department</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger className="w-full">
                <SelectValue />
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
          </div>
          <div className="flex flex-col gap-1.5 lg:w-44">
            <Label className="text-xs">Team</Label>
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger className="w-full">
                <SelectValue />
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
          <div className="flex flex-col gap-1.5 lg:w-48">
            <Label className="text-xs">Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All projects</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Total hours", value: formatMinutes(totals.minutes) },
          { label: "Entries", value: String(totals.entries) },
          { label: "People", value: String(totals.people) },
          { label: "Projects", value: String(totals.projectsUsed) },
        ].map((k) => (
          <Card key={k.label} className="gap-0 p-4">
            <div className="text-muted-foreground text-xs">{k.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{k.value}</div>
          </Card>
        ))}
      </div>

      {/* Body */}
      {tab === "calendar" ? (
        calendar === undefined ? (
          <Skeleton className="h-72 w-full" />
        ) : calendar.days.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-4">
            {monthsInRange(range.from, range.to).map((anchor) => (
              <div key={anchor} className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold">{monthLabel(anchor)}</h2>
                <TimesheetCalendar mode="month" anchor={anchor} data={calendarData} />
              </div>
            ))}
          </div>
        )
      ) : rows === undefined ? (
        <Skeleton className="h-64 w-full" />
      ) : visibleRows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Project</TableHead>
                <TableHead className="text-right">Entries</TableHead>
                <TableHead className="text-right">Hours</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((r: Row) => (
                <TableRow key={`${r.employeeId}:${r.projectId}`}>
                  <TableCell className="font-medium">{r.employeeName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.projectName}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.entries}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatMinutes(r.minutes)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
      <IconReportAnalytics className="text-muted-foreground size-8" stroke={1.5} />
      <p className="text-muted-foreground text-sm">
        No time was logged for these filters.
      </p>
    </div>
  )
}
