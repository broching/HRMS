"use client"

import { useQuery } from "convex/react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"
import type { Id } from "@/convex/_generated/dataModel"
import { api } from "@/convex/_generated/api"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatMinutes } from "@/features/timesheets/lib/time"

const PALETTE = [
  "#3b82f6",
  "#22c55e",
  "#a855f7",
  "#f97316",
  "#ec4899",
  "#14b8a6",
  "#eab308",
  "#64748b",
]

export function ProjectOverview({ projectId }: { projectId: Id<"projects"> }) {
  const data = useQuery(api.projects.overview, { projectId })

  if (data === undefined) {
    return (
      <div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-64 w-full" />
        ))}
      </div>
    )
  }

  const { completion, totalMinutes, budgetMinutes, estimateTotal } = data
  const donePct = completion.total
    ? Math.round((completion.done / completion.total) * 100)
    : 0
  const budgetPct = budgetMinutes
    ? Math.round((totalMinutes / budgetMinutes) * 100)
    : 0
  const over = budgetMinutes > 0 && totalMinutes > budgetMinutes

  const donutData = [
    { name: "Done", value: completion.done },
    { name: "Remaining", value: Math.max(0, completion.total - completion.done) },
  ]

  const burndownConfig = {
    logged: { label: "Logged", color: PALETTE[0] },
  } satisfies ChartConfig
  const barConfig = { minutes: { label: "Time", color: PALETTE[0] } } satisfies ChartConfig

  const peopleData = data.byEmployee
    .filter((e) => e.minutes > 0 || e.assigned > 0)
    .slice(0, 10)
    .map((e) => ({ name: e.name, minutes: e.minutes }))
  const stageData = data.byStage.map((s) => ({
    name: s.name,
    count: s.count,
    color: s.color ?? "#94a3b8",
  }))

  return (
    <div className="flex flex-col gap-4 px-4 pb-6 lg:px-6">
      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Completion" value={`${donePct}%`} sub={`${completion.done}/${completion.total} tasks`} />
        <Kpi label="Logged" value={formatMinutes(totalMinutes)} sub="from timesheets" />
        <Kpi
          label="Estimate / budget"
          value={budgetMinutes ? formatMinutes(budgetMinutes) : "—"}
          sub={estimateTotal ? `${formatMinutes(estimateTotal)} from tasks` : "no estimates"}
        />
        <Kpi
          label="Budget used"
          value={budgetMinutes ? `${budgetPct}%` : "—"}
          sub={over ? "over budget" : "on track"}
          tone={over ? "danger" : "normal"}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Burn-up: cumulative logged over time vs budget */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Time logged over time</CardTitle>
          </CardHeader>
          <CardContent>
            {data.burndown.length === 0 ? (
              <Empty />
            ) : (
              <ChartContainer config={burndownConfig} className="h-64 w-full">
                <AreaChart data={data.burndown}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    tickFormatter={(v) => `${Math.round((v as number) / 60)}h`}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(v) => formatMinutes(v as number)}
                      />
                    }
                  />
                  {budgetMinutes > 0 && (
                    <ReferenceLine
                      y={budgetMinutes}
                      stroke="#ef4444"
                      strokeDasharray="4 4"
                      label={{ value: "Budget", fontSize: 10, fill: "#ef4444" }}
                    />
                  )}
                  <Area
                    dataKey="logged"
                    type="monotone"
                    stroke={PALETTE[0]}
                    fill={PALETTE[0]}
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Completion donut */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Task completion</CardTitle>
          </CardHeader>
          <CardContent>
            {completion.total === 0 ? (
              <Empty />
            ) : (
              <ChartContainer
                config={{ Done: { label: "Done", color: PALETTE[1] } }}
                className="mx-auto h-64"
              >
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={90}
                  >
                    <Cell fill={PALETTE[1]} />
                    <Cell fill="#e2e8f0" />
                  </Pie>
                </PieChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Time by person */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Time by person</CardTitle>
          </CardHeader>
          <CardContent>
            {peopleData.length === 0 ? (
              <Empty />
            ) : (
              <ChartContainer config={barConfig} className="h-64 w-full">
                <BarChart data={peopleData} layout="vertical">
                  <CartesianGrid horizontal={false} />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    tickFormatter={(v) => `${Math.round((v as number) / 60)}h`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    width={90}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent formatter={(v) => formatMinutes(v as number)} />
                    }
                  />
                  <Bar dataKey="minutes" fill={PALETTE[0]} radius={3} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>

        {/* Tasks by stage */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Tasks by column</CardTitle>
          </CardHeader>
          <CardContent>
            {stageData.every((s) => s.count === 0) ? (
              <Empty />
            ) : (
              <ChartContainer
                config={{ count: { label: "Tasks", color: PALETTE[2] } }}
                className="h-64 w-full"
              >
                <BarChart data={stageData}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" radius={4}>
                    {stageData.map((s, i) => (
                      <Cell key={i} fill={s.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Kpi({
  label,
  value,
  sub,
  tone = "normal",
}: {
  label: string
  value: string
  sub?: string
  tone?: "normal" | "danger"
}) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "danger" && "text-red-600 dark:text-red-400",
        )}
      >
        {value}
      </p>
      {sub && <p className="text-muted-foreground mt-0.5 text-xs">{sub}</p>}
    </div>
  )
}

function Empty() {
  return (
    <div className="text-muted-foreground flex h-64 items-center justify-center text-sm">
      No data yet.
    </div>
  )
}
