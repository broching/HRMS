"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import {
  IconChevronLeft,
  IconChevronRight,
  IconUsers,
  IconClockHour4,
  IconUserCheck,
  IconChartBar,
  IconSearch,
  IconFilter,
  IconLayoutDashboard,
  IconReportAnalytics,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { permitted } from "@/convex/lib/permissions"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  todayIso,
  mondayOfIso,
  addDaysIso,
  addMonthsIso,
  monthRange,
  monthGrid,
  weekDates,
  sameMonth,
  weekRangeLabel,
  monthLabel,
  formatMinutes,
  formatHoursDecimal,
  formatDayLabel,
  formatClock,
  dowLabel,
  dayOfMonth,
} from "@/features/timesheets/lib/time"
import {
  EntryDialog,
  type EntryDraft,
} from "@/features/timesheets/components/entry-dialog"
import { TeamDayGrid } from "@/features/timesheets/components/team-day-grid"
import { TimesheetReport } from "@/features/timesheets/components/timesheet-report"

type Summary = FunctionReturnType<typeof api.timeEntries.teamSummary>
type Person = Summary["byEmployee"][number]
type Day = FunctionReturnType<typeof api.timeEntries.teamDay>
type View = "day" | "week" | "month"
type Scope = "team" | "org"

// The minimal shape the drill-in dialog needs — shared by week/month rows and
// day columns.
type PersonRef = { employeeId: string; name: string; jobTitle: string | null }

// One person's contribution on a single day, used by the week/month calendar.
type CalPerson = {
  employeeId: string
  name: string
  jobTitle: string | null
  color: string
  minutes: number
}

type ProjectDatum = {
  projectId: string
  name: string
  color: string | null
  minutes: number
}

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const ALL = "__all__"

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")
}

function datesInRange(from: string, to: string): string[] {
  const out: string[] = []
  let d = from
  let guard = 0
  while (d <= to && guard < 60) {
    out.push(d)
    d = addDaysIso(d, 1)
    guard++
  }
  return out
}

export function TeamTimesheets({ scope = "team" }: { scope?: Scope }) {
  const isOrg = scope === "org"
  const [mode, setMode] = React.useState<"board" | "report">("board")
  const [view, setView] = React.useState<View>("day")
  const [anchor, setAnchor] = React.useState<string>(() => todayIso())
  const [search, setSearch] = React.useState("")
  const [departmentId, setDepartmentId] = React.useState(ALL)
  const [teamId, setTeamId] = React.useState(ALL)
  const [projectId, setProjectId] = React.useState(ALL)
  const [logOpen, setLogOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<EntryDraft>({})
  const [selected, setSelected] = React.useState<PersonRef | null>(null)
  const [filtersOpen, setFiltersOpen] = React.useState(false)

  // Who am I + what can I log — drives the drag-to-log controls on the day grid.
  const member = useQuery(api.members.current)
  const meEmp = useQuery(api.employees.me)
  const myEmployeeId = meEmp?._id ?? null
  const canLogAny = isOrg
    ? permitted(member?.permissions, "timesheets:log:all")
    : permitted(member?.permissions, "timesheets:log:team")
  const canLogFor = React.useCallback(
    (employeeId: string) => canLogAny || employeeId === myEmployeeId,
    [canLogAny, myEmployeeId],
  )

  const range = React.useMemo(() => {
    if (view === "week") {
      const monday = mondayOfIso(anchor)
      return { from: monday, to: addDaysIso(monday, 6) }
    }
    if (view === "month") return monthRange(anchor)
    return { from: anchor, to: anchor }
  }, [view, anchor])

  const dept = departmentId === ALL ? undefined : (departmentId as Id<"departments">)
  const tid = teamId === ALL ? undefined : (teamId as Id<"teams">)
  const pid = projectId === ALL ? undefined : (projectId as Id<"projects">)

  // Only the query matching the active scope + view runs; the rest skip. Splitting
  // team vs org keeps each call's arg validator exact.
  const summaryActive = mode === "board" && view !== "day"
  const dayActive = mode === "board" && view === "day"

  const teamSummaryQ = useQuery(
    api.timeEntries.teamSummary,
    !isOrg && summaryActive
      ? { from: range.from, to: range.to, departmentId: dept, teamId: tid }
      : "skip",
  )
  const orgSummaryQ = useQuery(
    api.timeEntries.orgSummary,
    isOrg && summaryActive
      ? {
          from: range.from,
          to: range.to,
          departmentId: dept,
          teamId: tid,
          projectId: pid,
        }
      : "skip",
  )
  const teamDayQ = useQuery(
    api.timeEntries.teamDay,
    !isOrg && dayActive ? { date: anchor, departmentId: dept, teamId: tid } : "skip",
  )
  const orgDayQ = useQuery(
    api.timeEntries.orgDay,
    isOrg && dayActive
      ? { date: anchor, departmentId: dept, teamId: tid, projectId: pid }
      : "skip",
  )

  const summary = isOrg ? orgSummaryQ : teamSummaryQ
  const day = isOrg ? orgDayQ : teamDayQ

  const departments = useQuery(api.departments.list) ?? []
  const teams = useQuery(api.teams.list) ?? []
  const projectsAll = useQuery(api.projects.list) ?? []
  const projects = projectsAll.filter((p) => p.status === "active")

  const dates = datesInRange(range.from, range.to)
  const rangeLabel =
    view === "day"
      ? formatDayLabel(anchor)
      : view === "week"
        ? weekRangeLabel(mondayOfIso(anchor))
        : monthLabel(anchor)

  // Search filters the roster list only; department/team/project are applied
  // server-side so KPIs, projects, and the calendar stay accurate to the scope.
  const roster = React.useMemo(() => {
    const people = summary?.byEmployee ?? []
    const q = search.trim().toLowerCase()
    if (!q) return people
    return people.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.jobTitle ?? "").toLowerCase().includes(q),
    )
  }, [summary, search])

  // Day columns, narrowed by the same search.
  const dayPeople = React.useMemo(() => {
    const people = day?.people ?? []
    const q = search.trim().toLowerCase()
    if (!q) return people
    return people.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.jobTitle ?? "").toLowerCase().includes(q),
    )
  }, [day, search])

  // Per-day people for the calendar: who logged, coloured by their top project.
  const calendarPeople = React.useMemo(() => {
    const m = new Map<string, CalPerson[]>()
    for (const p of summary?.byEmployee ?? []) {
      for (const d of p.byDate) {
        if (d.minutes <= 0) continue
        const arr = m.get(d.date) ?? []
        arr.push({
          employeeId: p.employeeId,
          name: p.name,
          jobTitle: p.jobTitle,
          color: p.topProjectColor ?? "#6366f1",
          minutes: d.minutes,
        })
        m.set(d.date, arr)
      }
    }
    for (const arr of m.values()) arr.sort((a, b) => b.minutes - a.minutes)
    return m
  }, [summary])

  // KPI stats — sourced from whichever query drives the active view.
  const stats = React.useMemo(() => {
    if (view === "day") {
      const total = day?.totalMinutes ?? 0
      const logged = day?.peopleLogged ?? 0
      return { totalMinutes: total, peopleLogged: logged, people: logged }
    }
    return {
      totalMinutes: summary?.totalMinutes ?? 0,
      peopleLogged: summary?.peopleLogged ?? 0,
      people: summary?.byEmployee.length ?? 0,
    }
  }, [view, day, summary])

  // Project breakdown — from the summary for week/month, computed from the day
  // entries for the day view.
  const byProject: ProjectDatum[] = React.useMemo(() => {
    if (view === "day") {
      const m = new Map<string, ProjectDatum>()
      for (const p of day?.people ?? []) {
        for (const e of p.entries) {
          const cur =
            m.get(e.projectId) ??
            {
              projectId: e.projectId,
              name: e.projectName,
              color: e.projectColor,
              minutes: 0,
            }
          cur.minutes += e.minutes
          m.set(e.projectId, cur)
        }
      }
      return [...m.values()].sort((a, b) => b.minutes - a.minutes)
    }
    return summary?.byProject ?? []
  }, [view, day, summary])

  function step(dir: -1 | 1) {
    if (view === "day") setAnchor(addDaysIso(anchor, dir))
    else if (view === "week") setAnchor(addDaysIso(anchor, dir * 7))
    else setAnchor(addMonthsIso(anchor, dir))
  }

  const loading = view === "day" ? day === undefined : summary === undefined
  const isEmpty =
    view === "day"
      ? day !== undefined && day.people.length === 0
      : summary !== undefined && summary.byEmployee.length === 0

  // HR Lounge "Report" mode reuses the full org report component untouched.
  if (isOrg && mode === "report") {
    return (
      <div className="flex flex-col gap-4">
        <div className="px-4 lg:px-6">
          <ModeToggle mode={mode} onChange={setMode} />
        </div>
        <TimesheetReport />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      {isOrg && <ModeToggle mode={mode} onChange={setMode} />}

      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
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
          <div className="ml-1 text-sm font-semibold">{rangeLabel}</div>
        </div>
        <div className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => v && setView(v as View)}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="day" className="px-4">
              Day
            </ToggleGroupItem>
            <ToggleGroupItem value="week" className="px-4">
              Week
            </ToggleGroupItem>
            <ToggleGroupItem value="month" className="px-4">
              Month
            </ToggleGroupItem>
          </ToggleGroup>
          {/* Filters live behind a toggle on mobile so the calendar shows first. */}
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden"
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((o) => !o)}
          >
            <IconFilter className="size-4" />
            Filters
          </Button>
        </div>
      </div>

      {/* Filters — collapsed on mobile (see toggle above), always shown on desktop. */}
      <div
        className={cn(
          "flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:flex",
          filtersOpen ? "flex" : "hidden",
        )}
      >
        <div className="relative sm:max-w-xs sm:flex-1">
          <IconSearch className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder={isOrg ? "Search people" : "Search your people"}
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
        {isOrg && (
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All projects</SelectItem>
              {projectsAll.map((p) => (
                <SelectItem key={p._id} value={p._id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : isEmpty ? (
        <EmptyState scope={scope} filtered={dept !== undefined || tid !== undefined || pid !== undefined} />
      ) : (
        <>
          <KpiRow stats={stats} />

          {view === "day" ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
              <Card className="gap-0 overflow-hidden p-0">
                <TeamDayGrid
                  date={anchor}
                  people={dayPeople}
                  onSelectPerson={(p) =>
                    setSelected({
                      employeeId: p.employeeId,
                      name: p.name,
                      jobTitle: p.jobTitle,
                    })
                  }
                  canLogFor={canLogFor}
                  onLog={(person, d, minute, minutes) => {
                    const isSelf = person.employeeId === myEmployeeId
                    setDraft({
                      date: d,
                      startMinute: minute,
                      minutes: minutes ?? 60,
                      employeeId: isSelf ? undefined : person.employeeId,
                      employeeName: isSelf ? undefined : person.name,
                    })
                    setLogOpen(true)
                  }}
                  onEditEntry={(person, entry) => {
                    const isSelf = person.employeeId === myEmployeeId
                    setDraft({
                      entry,
                      employeeId: isSelf ? undefined : person.employeeId,
                      employeeName: isSelf ? undefined : person.name,
                    })
                    setLogOpen(true)
                  }}
                />
              </Card>
              <ProjectBreakdown byProject={byProject} totalMinutes={stats.totalMinutes} />
            </div>
          ) : (
            <>
              {/* Calendar first — who logged each day, coloured by top project. */}
              <TeamCalendar
                mode={view}
                anchor={anchor}
                people={calendarPeople}
                onSelectPerson={(id) => {
                  const p = summary?.byEmployee.find((x) => x.employeeId === id)
                  if (p)
                    setSelected({
                      employeeId: p.employeeId,
                      name: p.name,
                      jobTitle: p.jobTitle,
                    })
                }}
              />
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
                <PeopleHeatmap
                  people={roster}
                  total={summary?.byEmployee.length ?? 0}
                  dates={dates}
                  onSelect={(p) =>
                    setSelected({
                      employeeId: p.employeeId,
                      name: p.name,
                      jobTitle: p.jobTitle,
                    })
                  }
                />
                <ProjectBreakdown
                  byProject={byProject}
                  totalMinutes={stats.totalMinutes}
                />
              </div>
            </>
          )}
        </>
      )}

      <PersonDialog
        person={selected}
        from={range.from}
        to={range.to}
        onClose={() => setSelected(null)}
      />

      <EntryDialog
        open={logOpen}
        draft={draft}
        projects={projects}
        onOpenChange={setLogOpen}
      />
    </div>
  )
}

// ── Board / Report mode toggle (HR Lounge only) ──────────────────────────────

function ModeToggle({
  mode,
  onChange,
}: {
  mode: "board" | "report"
  onChange: (m: "board" | "report") => void
}) {
  return (
    <ToggleGroup
      type="single"
      value={mode}
      onValueChange={(v) => v && onChange(v as "board" | "report")}
      variant="outline"
      size="sm"
      className="self-start"
    >
      <ToggleGroupItem value="board" className="gap-1.5 px-3">
        <IconLayoutDashboard className="size-4" />
        Board
      </ToggleGroupItem>
      <ToggleGroupItem value="report" className="gap-1.5 px-3">
        <IconReportAnalytics className="size-4" />
        Report
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

function EmptyState({ scope, filtered }: { scope: Scope; filtered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
      <IconUsers className="text-muted-foreground size-8" stroke={1.5} />
      <p className="text-muted-foreground text-sm">
        {scope === "org"
          ? filtered
            ? "No time was logged in this scope for the selected range."
            : "No time has been logged across the organisation for this range."
          : filtered
            ? "No one in this scope reports to you in the selected range."
            : "No one reports to you yet, so there are no timesheets to show here."}
      </p>
    </div>
  )
}

// ── KPI cards ──────────────────────────────────────────────────────────────────

function KpiRow({
  stats,
}: {
  stats: { totalMinutes: number; peopleLogged: number; people: number }
}) {
  const avg =
    stats.peopleLogged > 0
      ? Math.round(stats.totalMinutes / stats.peopleLogged)
      : 0
  const kpis = [
    {
      label: "Total logged",
      value: formatMinutes(stats.totalMinutes),
      icon: IconClockHour4,
    },
    {
      label: "People logged",
      value: `${stats.peopleLogged}/${stats.people}`,
      icon: IconUserCheck,
    },
    { label: "Avg / person", value: formatMinutes(avg), icon: IconChartBar },
  ]
  return (
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
  )
}

// ── Team calendar ──────────────────────────────────────────────────────────────
// A week/month calendar showing who logged time each day. Each day is tinted by
// its busiest project's colour, and the people who logged are shown as avatars
// ringed in their top project's colour — click one to drill into their entries.

function TeamCalendar({
  mode,
  anchor,
  people,
  onSelectPerson,
}: {
  mode: "week" | "month"
  anchor: string
  people: Map<string, CalPerson[]>
  onSelectPerson: (employeeId: string) => void
}) {
  const today = todayIso()
  const peak = React.useMemo(() => {
    let max = 0
    for (const arr of people.values()) {
      const t = arr.reduce((s, p) => s + p.minutes, 0)
      if (t > max) max = t
    }
    return Math.max(max, 60)
  }, [people])

  const weeks: string[][] =
    mode === "month" ? monthGrid(anchor) : [weekDates(mondayOfIso(anchor))]
  const maxAvatars = mode === "month" ? 3 : 6

  return (
    <Card className="gap-0 overflow-hidden p-0">
      {/* Horizontal scroll keeps day columns usable on narrow screens. */}
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
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
                {week.map((date) => {
                  const dayPeople = people.get(date) ?? []
                  const minutes = dayPeople.reduce((s, p) => s + p.minutes, 0)
                  const inMonth = mode === "week" || sameMonth(date, anchor)
                  const isToday = date === today
                  const top = dayPeople[0]
                  const intensity =
                    minutes > 0 ? 0.12 + 0.5 * Math.min(1, minutes / peak) : 0
                  return (
                    <div
                      key={date}
                      className={cn(
                        "relative flex flex-col gap-1.5 border-r border-b p-2 text-left",
                        mode === "week" ? "min-h-[140px]" : "min-h-[96px]",
                        !inMonth && "bg-muted/20 text-muted-foreground",
                      )}
                      style={
                        top && inMonth
                          ? {
                              backgroundColor: `color-mix(in srgb, ${top.color} ${Math.round(
                                intensity * 100,
                              )}%, transparent)`,
                            }
                          : undefined
                      }
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
                                isToday &&
                                  "bg-primary text-primary-foreground font-semibold",
                              )}
                            >
                              {dayOfMonth(date)}
                            </span>
                          </span>
                        ) : (
                          <span
                            className={cn(
                              "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                              isToday &&
                                "bg-primary text-primary-foreground font-semibold",
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

                      {dayPeople.length > 0 && (
                        <div className="mt-auto flex items-center">
                          <div className="flex -space-x-2">
                            {dayPeople.slice(0, maxAvatars).map((p) => (
                              <button
                                key={p.employeeId}
                                type="button"
                                onClick={() => onSelectPerson(p.employeeId)}
                                title={`${p.name} · ${formatMinutes(p.minutes)}`}
                                className="relative inline-flex rounded-full border-2 bg-background transition-transform hover:z-10 hover:-translate-y-0.5"
                                style={{ borderColor: p.color }}
                              >
                                <Avatar className="size-6">
                                  <AvatarFallback className="text-[9px] font-medium">
                                    {initials(p.name)}
                                  </AvatarFallback>
                                </Avatar>
                              </button>
                            ))}
                          </div>
                          {dayPeople.length > maxAvatars && (
                            <span className="text-muted-foreground ml-1.5 text-[11px] font-medium">
                              +{dayPeople.length - maxAvatars}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}

// ── People heatmap ───────────────────────────────────────────────────────────

function PeopleHeatmap({
  people,
  total,
  dates,
  onSelect,
}: {
  people: Person[]
  total: number
  dates: string[]
  onSelect: (p: Person) => void
}) {
  const peak = React.useMemo(() => {
    let max = 0
    for (const p of people) {
      for (const d of p.byDate) if (d.minutes > max) max = d.minutes
    }
    return Math.max(max, 60)
  }, [people])

  const compact = dates.length > 10 // month → tighter cells

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <h3 className="text-sm font-semibold">People</h3>
        <span className="text-muted-foreground text-xs">
          {people.length === total
            ? `${total} people`
            : `${people.length} of ${total}`}
        </span>
      </div>
      {people.length === 0 ? (
        <p className="text-muted-foreground px-4 py-10 text-center text-sm">
          No one matches your search.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-fit">
            {/* Date header */}
            <div className="text-muted-foreground flex items-center border-b px-4 py-1.5 text-[10px]">
              <div className="w-44 shrink-0" />
              <div className="flex gap-0.5">
                {dates.map((d) => (
                  <div
                    key={d}
                    className={cn(
                      "text-center tabular-nums",
                      compact ? "w-4" : "w-7",
                    )}
                    title={formatDayLabel(d)}
                  >
                    {compact ? dayOfMonth(d) : dowLabel(d)[0]}
                  </div>
                ))}
              </div>
              <div className="w-16 shrink-0 text-right">Total</div>
            </div>

            {people.map((p) => {
              const dayMap = new Map(p.byDate.map((d) => [d.date, d.minutes]))
              const color = p.topProjectColor ?? "#6366f1"
              return (
                <button
                  key={p.employeeId}
                  type="button"
                  onClick={() => onSelect(p)}
                  className="hover:bg-accent/40 flex w-full items-center border-b px-4 py-2 text-left transition-colors last:border-b-0"
                >
                  <div className="flex w-44 shrink-0 items-center gap-2">
                    <Avatar className="size-7">
                      <AvatarFallback className="text-[10px] font-medium">
                        {initials(p.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{p.name}</div>
                      {p.jobTitle && (
                        <div className="text-muted-foreground truncate text-[11px]">
                          {p.jobTitle}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-0.5">
                    {dates.map((d) => {
                      const m = dayMap.get(d) ?? 0
                      const intensity = m > 0 ? 0.2 + 0.8 * Math.min(1, m / peak) : 0
                      return (
                        <div
                          key={d}
                          className={cn(
                            "rounded-sm",
                            compact ? "h-6 w-4" : "h-7 w-7",
                          )}
                          style={{
                            backgroundColor:
                              m > 0
                                ? `color-mix(in srgb, ${color} ${Math.round(intensity * 100)}%, transparent)`
                                : "var(--muted)",
                          }}
                          title={`${formatDayLabel(d)} · ${m > 0 ? formatMinutes(m) : "—"}`}
                        />
                      )
                    })}
                  </div>
                  <div className="w-16 shrink-0 text-right text-sm font-medium tabular-nums">
                    {p.minutes > 0 ? formatHoursDecimal(p.minutes) : "—"}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </Card>
  )
}

// ── Project breakdown ──────────────────────────────────────────────────────────

function ProjectBreakdown({
  byProject,
  totalMinutes,
}: {
  byProject: ProjectDatum[]
  totalMinutes: number
}) {
  const max = byProject[0]?.minutes ?? 0
  return (
    <Card className="h-fit gap-0 p-4">
      <h3 className="text-sm font-semibold">By project</h3>
      {byProject.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-xs">No time logged.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {byProject.map((p) => {
            const pct = totalMinutes
              ? Math.round((p.minutes / totalMinutes) * 100)
              : 0
            return (
              <li key={p.projectId} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: p.color ?? "#94a3b8" }}
                    />
                    <span className="truncate">{p.name}</span>
                  </span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    {formatMinutes(p.minutes)}
                  </span>
                </div>
                <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${max ? (p.minutes / max) * 100 : 0}%`,
                      backgroundColor: p.color ?? "#94a3b8",
                    }}
                  />
                </div>
                <span className="text-muted-foreground text-[11px] tabular-nums">
                  {pct}% of team time
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

// ── Person drill-in ────────────────────────────────────────────────────────────

function PersonDialog({
  person,
  from,
  to,
  onClose,
}: {
  person: PersonRef | null
  from: string
  to: string
  onClose: () => void
}) {
  const entries = useQuery(
    api.timeEntries.forEmployee,
    person
      ? { employeeId: person.employeeId as Id<"employees">, from, to }
      : "skip",
  )

  const byDay = React.useMemo(() => {
    const m = new Map<string, NonNullable<typeof entries>>()
    for (const e of entries ?? []) {
      const arr = m.get(e.date) ?? []
      arr.push(e)
      m.set(e.date, arr as NonNullable<typeof entries>)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [entries])

  return (
    <Dialog open={person !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {person && (
              <Avatar className="size-7">
                <AvatarFallback className="text-[10px] font-medium">
                  {initials(person.name)}
                </AvatarFallback>
              </Avatar>
            )}
            <span className="flex flex-col">
              <span>{person?.name}</span>
              {person?.jobTitle && (
                <span className="text-muted-foreground text-xs font-normal">
                  {person.jobTitle}
                </span>
              )}
            </span>
          </DialogTitle>
        </DialogHeader>
        {entries === undefined ? (
          <Skeleton className="h-40 w-full" />
        ) : byDay.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No time logged in this range.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {byDay.map(([date, dayEntries]) => (
              <div key={date}>
                <div className="text-muted-foreground mb-1 flex items-center justify-between text-xs font-medium">
                  <span>{formatDayLabel(date)}</span>
                  <span className="tabular-nums">
                    {formatMinutes(dayEntries.reduce((s, e) => s + e.minutes, 0))}
                  </span>
                </div>
                <ul className="divide-y rounded-md border">
                  {dayEntries.map((e) => (
                    <li key={e._id} className="flex items-start gap-2 px-3 py-2">
                      <span
                        className="mt-1 size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: e.projectColor ?? "#94a3b8" }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 text-sm">
                          <span className="font-medium">{e.projectName}</span>
                          {e.taskName && (
                            <span className="text-muted-foreground">· {e.taskName}</span>
                          )}
                        </div>
                        {e.description && (
                          <p className="text-muted-foreground text-xs">
                            {e.description}
                          </p>
                        )}
                        {e.startMinute != null && (
                          <p className="text-muted-foreground text-[11px] tabular-nums">
                            {formatClock(e.startMinute)}
                          </p>
                        )}
                      </div>
                      <span className="text-sm font-medium tabular-nums">
                        {formatMinutes(e.minutes)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
