"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import {
  IconChevronLeft,
  IconChevronRight,
  IconUsers,
  IconClockHour4,
  IconClockPlus,
  IconUserCheck,
  IconCoin,
  IconChartBar,
  IconSearch,
  IconLayoutList,
  IconCalendarMonth,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
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
  TimesheetCalendar,
  type DayDatum,
} from "@/features/timesheets/components/timesheet-calendar"
import {
  EntryDialog,
  type EntryDraft,
} from "@/features/timesheets/components/entry-dialog"

type Summary = FunctionReturnType<typeof api.timeEntries.teamSummary>
type Person = Summary["byEmployee"][number]
type View = "week" | "month"
type Display = "roster" | "calendar"

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

export function TeamTimesheets() {
  const [view, setView] = React.useState<View>("week")
  const [display, setDisplay] = React.useState<Display>("roster")
  const [anchor, setAnchor] = React.useState<string>(() => todayIso())
  const [search, setSearch] = React.useState("")
  const [departmentId, setDepartmentId] = React.useState(ALL)
  const [teamId, setTeamId] = React.useState(ALL)
  const [logOpen, setLogOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<EntryDraft>({})

  const range = React.useMemo(() => {
    if (view === "week") {
      const monday = mondayOfIso(anchor)
      return { from: monday, to: addDaysIso(monday, 6) }
    }
    return monthRange(anchor)
  }, [view, anchor])

  const summary = useQuery(api.timeEntries.teamSummary, {
    ...range,
    departmentId: departmentId === ALL ? undefined : (departmentId as Id<"departments">),
    teamId: teamId === ALL ? undefined : (teamId as Id<"teams">),
  })
  const departments = useQuery(api.departments.list) ?? []
  const teams = useQuery(api.teams.list) ?? []
  const projectsAll = useQuery(api.projects.list) ?? []
  const projects = projectsAll.filter((p) => p.status === "active")

  const [selected, setSelected] = React.useState<Person | null>(null)

  const dates = datesInRange(range.from, range.to)
  const rangeLabel =
    view === "week" ? weekRangeLabel(mondayOfIso(anchor)) : monthLabel(anchor)

  // Search filters the roster list only; department/team are applied server-side
  // so KPIs, projects, and the calendar stay accurate to the selected scope.
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

  // Per-day roll-up for the calendar: team minutes + how many people logged.
  const calendarData = React.useMemo(() => {
    const m = new Map<string, DayDatum>()
    for (const p of summary?.byEmployee ?? []) {
      for (const d of p.byDate) {
        if (d.minutes <= 0) continue
        const cur = m.get(d.date) ?? { minutes: 0, people: 0 }
        cur.minutes += d.minutes
        cur.people = (cur.people ?? 0) + 1
        m.set(d.date, cur)
      }
    }
    return m
  }, [summary])

  function step(dir: -1 | 1) {
    if (view === "week") setAnchor(addDaysIso(anchor, dir * 7))
    else setAnchor(addMonthsIso(anchor, dir))
  }

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      {/* Quick-log — a manager logs their own time without leaving the view. */}
      <QuickLog
        projects={projects}
        onQuick={(d) => {
          setDraft(d)
          setLogOpen(true)
        }}
      />

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
            value={display}
            onValueChange={(v) => v && setDisplay(v as Display)}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="roster" className="px-3" aria-label="Roster">
              <IconLayoutList className="size-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="calendar" className="px-3" aria-label="Calendar">
              <IconCalendarMonth className="size-4" />
            </ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => v && setView(v as View)}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="week" className="px-4">
              Week
            </ToggleGroupItem>
            <ToggleGroupItem value="month" className="px-4">
              Month
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <IconSearch className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search your people"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={departmentId} onValueChange={setDepartmentId}>
          <SelectTrigger className="w-full sm:w-48">
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
          <SelectTrigger className="w-full sm:w-44">
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

      {summary === undefined ? (
        <Skeleton className="h-96 w-full" />
      ) : summary.byEmployee.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <IconUsers className="text-muted-foreground size-8" stroke={1.5} />
          <p className="text-muted-foreground text-sm">
            {departmentId !== ALL || teamId !== ALL
              ? "No one in this scope reports to you in the selected range."
              : "No one reports to you yet, so there are no timesheets to show here."}
          </p>
        </div>
      ) : (
        <>
          <KpiRow summary={summary} />
          {display === "calendar" ? (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
              <Card className="gap-0 p-3">
                <TimesheetCalendar
                  mode={view}
                  anchor={anchor}
                  data={calendarData}
                />
              </Card>
              <ProjectBreakdown summary={summary} />
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
              <PeopleHeatmap
                people={roster}
                total={summary.byEmployee.length}
                dates={dates}
                onSelect={setSelected}
              />
              <ProjectBreakdown summary={summary} />
            </div>
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

// ── Quick-log cards ──────────────────────────────────────────────────────────

function QuickLog({
  projects,
  onQuick,
}: {
  projects: FunctionReturnType<typeof api.projects.list>
  onQuick: (draft: EntryDraft) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      <button
        type="button"
        onClick={() => onQuick({ date: todayIso() })}
        className="border-primary/40 bg-primary/5 hover:bg-primary/10 flex items-center gap-2 rounded-xl border border-dashed p-3 text-left transition-colors"
      >
        <span className="bg-primary/15 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
          <IconClockPlus className="size-4" />
        </span>
        <span className="text-sm font-medium">Log my time</span>
      </button>
      {projects.slice(0, 4).map((p) => (
        <button
          key={p._id}
          type="button"
          onClick={() => onQuick({ date: todayIso(), projectId: p._id })}
          className="hover:border-primary/40 hover:bg-accent/40 flex items-center gap-2 rounded-xl border p-3 text-left transition-colors"
        >
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: p.color ?? "#94a3b8" }}
          />
          <span className="min-w-0 truncate text-sm font-medium">{p.name}</span>
        </button>
      ))}
    </div>
  )
}

// ── KPI cards ──────────────────────────────────────────────────────────────────

function KpiRow({ summary }: { summary: Summary }) {
  const people = summary.byEmployee.length
  const billablePct =
    summary.totalMinutes > 0
      ? Math.round((summary.billableMinutes / summary.totalMinutes) * 100)
      : 0
  const avg =
    summary.peopleLogged > 0
      ? Math.round(summary.totalMinutes / summary.peopleLogged)
      : 0

  const kpis = [
    {
      label: "Total logged",
      value: formatMinutes(summary.totalMinutes),
      icon: IconClockHour4,
    },
    {
      label: "People logged",
      value: `${summary.peopleLogged}/${people}`,
      icon: IconUserCheck,
    },
    { label: "Billable", value: `${billablePct}%`, icon: IconCoin },
    { label: "Avg / person", value: formatMinutes(avg), icon: IconChartBar },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {kpis.map((k) => (
        <Card key={k.label} className="gap-0 p-4">
          <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <k.icon className="size-3.5" />
            {k.label}
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{k.value}</div>
        </Card>
      ))}
    </div>
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
  // Peak day across everyone, for a shared intensity scale.
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
        <h3 className="text-sm font-semibold">Team</h3>
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

function ProjectBreakdown({ summary }: { summary: Summary }) {
  const max = summary.byProject[0]?.minutes ?? 0
  return (
    <Card className="h-fit gap-0 p-4">
      <h3 className="text-sm font-semibold">By project</h3>
      {summary.byProject.length === 0 ? (
        <p className="text-muted-foreground mt-2 text-xs">No time logged.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {summary.byProject.map((p) => {
            const pct = summary.totalMinutes
              ? Math.round((p.minutes / summary.totalMinutes) * 100)
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
  person: Person | null
  from: string
  to: string
  onClose: () => void
}) {
  const entries = useQuery(
    api.timeEntries.forEmployee,
    person ? { employeeId: person.employeeId as Id<"employees">, from, to } : "skip",
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
                          {e.billable && (
                            <Badge variant="outline" className="text-[10px]">
                              Billable
                            </Badge>
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
