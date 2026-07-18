"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  XAxis,
  YAxis,
} from "recharts"
import { IconAlertTriangle } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  todayIso,
  addDaysIso,
  monthRange,
  formatMinutes,
  dowLabel,
  dayOfMonth,
} from "@/features/timesheets/lib/time"

const ALL = "__all__"

const RANGE_PRESETS: Record<string, { label: string; range: () => { start: string; end: string } }> = {
  "7": { label: "Last 7 days", range: () => ({ start: addDaysIso(todayIso(), -6), end: todayIso() }) },
  "30": { label: "Last 30 days", range: () => ({ start: addDaysIso(todayIso(), -29), end: todayIso() }) },
  month: {
    label: "This month",
    range: () => {
      const { from, to } = monthRange(todayIso())
      return { start: from, end: to }
    },
  },
  "90": { label: "Last 90 days", range: () => ({ start: addDaysIso(todayIso(), -89), end: todayIso() }) },
}

const PALETTE = {
  scheduled: "#6366f1",
  actual: "#0ea5e9",
  logged: "#22c55e",
}

const PROJECT_PALETTE = ["#3b82f6", "#22c55e", "#a855f7", "#f97316", "#ec4899", "#14b8a6", "#eab308", "#64748b"]

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "danger" | "normal" }) {
  return (
    <Card className="gap-0 p-4">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums sm:text-2xl",
          tone === "danger" && "text-red-600 dark:text-red-400",
        )}
      >
        {value}
      </div>
      {sub && <div className="text-muted-foreground mt-0.5 text-xs">{sub}</div>}
    </Card>
  )
}

export function RosterReports({ scope }: { scope: "team" | "org" }) {
  const [preset, setPreset] = React.useState("30")
  const [departmentId, setDepartmentId] = React.useState(ALL)
  const [teamId, setTeamId] = React.useState(ALL)
  const [projectId, setProjectId] = React.useState(ALL)

  const { start, end } = RANGE_PRESETS[preset].range()
  const departments = useQuery(api.departments.list) ?? []
  const teams = useQuery(api.teams.list) ?? []
  const projects = useQuery(api.projects.list) ?? []

  const data = useQuery(api.schedules.rosterReport, {
    scope,
    start,
    end,
    departmentId: departmentId === ALL ? undefined : (departmentId as Id<"departments">),
    teamId: teamId === ALL ? undefined : (teamId as Id<"teams">),
    projectId: projectId === ALL ? undefined : (projectId as Id<"projects">),
  })

  const dayConfig = {
    scheduledMinutes: { label: "Scheduled", color: PALETTE.scheduled },
    actualMinutes: { label: "Clocked", color: PALETTE.actual },
    loggedMinutes: { label: "Logged", color: PALETTE.logged },
  } satisfies ChartConfig

  const attendanceRate =
    data && data.totals.expectedDays > 0
      ? Math.round((data.totals.presentDays / data.totals.expectedDays) * 100)
      : null

  const dayData = (data?.byDay ?? []).map((d) => ({
    ...d,
    label: preset === "month" || preset === "90" ? `${dowLabel(d.date)} ${dayOfMonth(d.date)}` : dowLabel(d.date),
  }))
  const projectData = (data?.byProject ?? []).slice(0, 8)

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Select value={preset} onValueChange={setPreset}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(RANGE_PRESETS).map(([k, p]) => (
              <SelectItem key={k} value={k}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="All projects" />
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

      {data?.truncated && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <IconAlertTriangle className="size-4 shrink-0" />
          Showing a capped slice of a large range — narrow the dates or filters for
          exact figures.
        </div>
      )}

      {data === undefined ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label="Scheduled" value={formatMinutes(data.totals.scheduledMinutes)} sub={`${data.peopleCount} people`} />
            <Kpi label="Clocked (actual)" value={formatMinutes(data.totals.actualMinutes)} sub="from attendance" />
            <Kpi label="Logged" value={formatMinutes(data.totals.loggedMinutes)} sub={`${formatMinutes(data.totals.billableMinutes)} billable`} />
            <Kpi
              label="Attendance rate"
              value={attendanceRate === null ? "—" : `${attendanceRate}%`}
              sub={`${data.totals.presentDays}/${data.totals.expectedDays} expected days`}
            />
            <Kpi label="Overtime" value={formatMinutes(data.totals.overtimeMinutes)} sub="scheduled + approved" />
            <Kpi label="Late arrivals" value={String(data.totals.lateCount)} sub="vs scheduled start" tone={data.totals.lateCount > 0 ? "danger" : "normal"} />
            <Kpi label="Absences" value={String(data.totals.absentCount)} sub="expected but no clock-in" tone={data.totals.absentCount > 0 ? "danger" : "normal"} />
            <Kpi
              label="Utilisation"
              value={
                data.totals.scheduledMinutes > 0
                  ? `${Math.round((data.totals.actualMinutes / data.totals.scheduledMinutes) * 100)}%`
                  : "—"
              }
              sub="clocked ÷ scheduled"
            />
          </div>

          {/* Scheduled vs actual vs logged per day */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Scheduled vs clocked vs logged</CardTitle>
            </CardHeader>
            <CardContent>
              {dayData.length === 0 ? (
                <Empty />
              ) : (
                <ChartContainer config={dayConfig} className="h-72 w-full">
                  <BarChart data={dayData}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} interval="preserveStartEnd" />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v) => `${Math.round((v as number) / 60)}h`} />
                    <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatMinutes(v as number)} />} />
                    <Legend />
                    <Bar dataKey="scheduledMinutes" fill={PALETTE.scheduled} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="actualMinutes" fill={PALETTE.actual} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="loggedMinutes" fill={PALETTE.logged} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            {/* By project (timesheets) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Logged by project</CardTitle>
              </CardHeader>
              <CardContent>
                {projectData.length === 0 ? (
                  <Empty />
                ) : (
                  <ChartContainer
                    config={{ loggedMinutes: { label: "Logged", color: PROJECT_PALETTE[0] } }}
                    className="h-72 w-full"
                  >
                    <BarChart data={projectData} layout="vertical" margin={{ left: 8 }}>
                      <CartesianGrid horizontal={false} />
                      <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} tickFormatter={(v) => `${Math.round((v as number) / 60)}h`} />
                      <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} fontSize={11} width={110} />
                      <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatMinutes(v as number)} />} />
                      <Bar dataKey="loggedMinutes" radius={[0, 2, 2, 0]}>
                        {projectData.map((p, i) => (
                          <Cell key={p.projectId} fill={p.color ?? PROJECT_PALETTE[i % PROJECT_PALETTE.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            {/* Per-employee table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">By person</CardTitle>
              </CardHeader>
              <CardContent>
                {data.byEmployee.length === 0 ? (
                  <Empty />
                ) : (
                  <div className="max-h-72 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="text-muted-foreground sticky top-0 bg-background text-xs">
                        <tr className="border-b text-right">
                          <th className="py-1.5 text-left font-medium">Person</th>
                          <th className="py-1.5 font-medium">Sched</th>
                          <th className="py-1.5 font-medium">Clocked</th>
                          <th className="py-1.5 font-medium">Logged</th>
                          <th className="py-1.5 font-medium">OT</th>
                          <th className="py-1.5 font-medium">Late</th>
                          <th className="py-1.5 font-medium">Abs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.byEmployee.map((e) => (
                          <tr key={e.employeeId} className="border-b text-right tabular-nums">
                            <td className="py-1.5 text-left">{e.name}</td>
                            <td className="py-1.5">{formatMinutes(e.scheduledMinutes)}</td>
                            <td className="py-1.5">{formatMinutes(e.actualMinutes)}</td>
                            <td className="py-1.5">{formatMinutes(e.loggedMinutes)}</td>
                            <td className="py-1.5">{formatMinutes(e.overtimeMinutes)}</td>
                            <td className={cn("py-1.5", e.lateCount > 0 && "text-amber-600 dark:text-amber-400")}>{e.lateCount}</td>
                            <td className={cn("py-1.5", e.absentCount > 0 && "text-red-600 dark:text-red-400")}>{e.absentCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

function Empty() {
  return (
    <div className="text-muted-foreground flex h-40 items-center justify-center text-sm">
      No data for this range.
    </div>
  )
}
