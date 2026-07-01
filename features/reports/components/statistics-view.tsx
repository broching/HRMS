"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts"
import {
  IconDownload,
  IconGenderMale,
  IconGenderFemale,
  IconArrowUp,
  IconArrowDown,
} from "@tabler/icons-react"
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
import { Button } from "@/components/ui/button"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  toCsv,
  downloadFile,
  type Cell as CsvCell,
} from "@/features/reports/lib/export"

const PALETTE = [
  "#f59e0b",
  "#8b5cf6",
  "#3b82f6",
  "#ef4444",
  "#10b981",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#6366f1",
]

const SUB_TABS = [
  { key: "general", label: "General" },
  { key: "attrition", label: "Attrition" },
  { key: "leave", label: "Leave" },
  { key: "payroll", label: "Payroll" },
] as const

type SubTab = (typeof SUB_TABS)[number]["key"]

function money(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(0)} ${currency}`
  }
}

export function StatisticsView() {
  const [tab, setTab] = React.useState<SubTab>("general")
  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <div className="flex gap-5 border-b">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "border-b-2 pb-2 text-sm transition-colors",
              tab === t.key
                ? "border-primary text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "general" && <GeneralStats />}
      {tab === "attrition" && <AttritionStats />}
      {tab === "leave" && <LeaveStats />}
      {tab === "payroll" && <PayrollStats />}
    </div>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <p className="text-muted-foreground py-16 text-center text-sm">{label}</p>
  )
}

// ─── General ────────────────────────────────────────────────────────────────

function GeneralStats() {
  const data = useQuery(api.reports.general, {})
  if (data === undefined) return <Skeleton className="h-96 w-full" />
  if (data === null) return <EmptyState label="No data available." />

  const { gender } = data
  const total = gender.male + gender.female + gender.other
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 10000) / 100)

  const deptConfig: ChartConfig = {
    male: { label: "Male", color: "#f59e0b" },
    female: { label: "Female", color: "#8b5cf6" },
    other: { label: "Other", color: "#94a3b8" },
  }
  const countConfig: ChartConfig = {
    count: { label: "Employees", color: "#f59e0b" },
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Overall Gender Statistics</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-8">
              <div className="flex items-center gap-3">
                <IconGenderMale className="size-8 text-[#3b82f6]" />
                <div>
                  <div className="text-muted-foreground text-sm">Male</div>
                  <div className="text-2xl font-semibold text-[#3b82f6]">
                    {pct(gender.male)}%
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <IconGenderFemale className="size-8 text-[#ec4899]" />
                <div>
                  <div className="text-muted-foreground text-sm">Female</div>
                  <div className="text-2xl font-semibold text-[#ec4899]">
                    {pct(gender.female)}%
                  </div>
                </div>
              </div>
            </div>
            <div className="divide-y border-t">
              <StatRow
                label="Workforce Age (Average year)"
                value={`${data.avgAgeYears}y`}
              />
              <StatRow
                label="Years of service (Average year)"
                value={`${data.avgTenureYears}y`}
              />
              <StatRow
                label="Total number of Employees"
                value={String(data.totalEmployees)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gender Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            {data.byDepartment.length === 0 ? (
              <EmptyState label="No departments." />
            ) : (
              <ChartContainer config={deptConfig} className="h-72 w-full">
                <BarChart data={data.byDepartment}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    interval={0}
                    angle={-30}
                    textAnchor="end"
                    height={70}
                  />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                  <Bar dataKey="male" fill="#f59e0b" radius={2} />
                  <Bar dataKey="female" fill="#8b5cf6" radius={2} />
                  <Bar dataKey="other" fill="#94a3b8" radius={2} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CategoryBar
          title="Employees by Branch"
          data={data.byBranch.map((b) => ({ label: b.name, count: b.count }))}
          config={countConfig}
        />
        <CategoryBar
          title="Employees by Age Group"
          data={data.byAgeGroup.map((b) => ({ label: b.group, count: b.count }))}
          config={countConfig}
          colorByIndex
        />
        <CategoryBar
          title="Employees by Service Tenure"
          data={data.byTenure.map((b) => ({ label: b.group, count: b.count }))}
          config={countConfig}
          colorByIndex
        />
        <CategoryBar
          title="Employees by Nationality"
          data={data.byNationality.map((b) => ({
            label: b.name,
            count: b.count,
          }))}
          config={countConfig}
          colorByIndex
        />
      </div>
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-xl font-semibold">{value}</span>
    </div>
  )
}

function CategoryBar({
  title,
  data,
  config,
  colorByIndex,
}: {
  title: string
  data: { label: string; count: number }[]
  config: ChartConfig
  colorByIndex?: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState label="No data." />
        ) : (
          <ChartContainer config={config} className="h-64 w-full">
            <BarChart data={data}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                fontSize={11}
                interval={0}
                angle={data.length > 4 ? -30 : 0}
                textAnchor={data.length > 4 ? "end" : "middle"}
                height={data.length > 4 ? 70 : 30}
              />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" radius={4}>
                {data.map((_, i) => (
                  <Cell
                    key={i}
                    fill={colorByIndex ? PALETTE[i % PALETTE.length] : "#f59e0b"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Attrition ────────────────────────────────────────────────────────────

function AttritionStats() {
  const now = new Date().getFullYear()
  const [year, setYear] = React.useState(now)
  const data = useQuery(api.reports.attrition, { year })

  const yearOptions = [now, now - 1, now - 2]

  const chartData = React.useMemo(() => {
    if (!data) return []
    return data.months.map((m, i) => {
      const row: Record<string, string | number> = { month: m }
      for (const o of data.offices) row[o.name] = o.values[i]
      row.Total = data.total[i]
      return row
    })
  }, [data])

  const config: ChartConfig = React.useMemo(() => {
    const c: ChartConfig = { Total: { label: "Total", color: "#111827" } }
    data?.offices.forEach((o, i) => {
      c[o.name] = { label: o.name, color: PALETTE[i % PALETTE.length] }
    })
    return c
  }, [data])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Employees Turnover</CardTitle>
        <YearSelect value={year} onChange={setYear} options={yearOptions} />
      </CardHeader>
      <CardContent>
        {data === undefined ? (
          <Skeleton className="h-72 w-full" />
        ) : data === null ? (
          <EmptyState label="No data available." />
        ) : (
          <ChartContainer config={config} className="h-80 w-full">
            <LineChart data={chartData}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                fontSize={12}
              />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Legend />
              {data.offices.map((o, i) => (
                <Line
                  key={o.name}
                  type="monotone"
                  dataKey={o.name}
                  stroke={PALETTE[i % PALETTE.length]}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
              <Line
                type="monotone"
                dataKey="Total"
                stroke="#111827"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Leave ────────────────────────────────────────────────────────────────

function LeaveStats() {
  const now = new Date().getFullYear()
  const [year, setYear] = React.useState(now)
  const data = useQuery(api.reports.leave, { year })
  const yearOptions = [now, now - 1, now - 2]

  const utilConfig: ChartConfig = {}
  data?.utilization.forEach((u, i) => {
    utilConfig[u.name] = { label: u.name, color: u.color || PALETTE[i % PALETTE.length] }
  })
  const monthlyConfig: ChartConfig = {
    days: { label: "Days", color: "#f59e0b" },
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <YearSelect value={year} onChange={setYear} options={yearOptions} />
      </div>
      {data === undefined ? (
        <Skeleton className="h-96 w-full" />
      ) : data === null ? (
        <EmptyState label="No data available." />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryCard
              label="All Combined"
              value={`${data.summary.allCombinedDays} day off`}
            />
            <SummaryCard
              label="Compare To Last Year"
              value={`${
                data.summary.comparedToLastYearDays >= 0 ? "+" : ""
              }${data.summary.comparedToLastYearDays} days`}
            />
            <SummaryCard
              label="Average Leave Per Month"
              value={`${data.summary.avgPerMonthDays} days`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Leave Utilization</CardTitle>
              </CardHeader>
              <CardContent>
                {data.utilization.length === 0 ? (
                  <EmptyState label="No approved leave this year." />
                ) : (
                  <ChartContainer config={utilConfig} className="h-72 w-full">
                    <PieChart>
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Pie
                        data={data.utilization}
                        dataKey="days"
                        nameKey="name"
                        innerRadius={0}
                        outerRadius={100}
                      >
                        {data.utilization.map((u, i) => (
                          <Cell
                            key={i}
                            fill={u.color || PALETTE[i % PALETTE.length]}
                          />
                        ))}
                      </Pie>
                      <Legend />
                    </PieChart>
                  </ChartContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Leave Count Overall — {data.year}</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={monthlyConfig} className="h-72 w-full">
                  <LineChart data={data.monthly}>
                    <CartesianGrid vertical={false} />
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={false}
                      fontSize={12}
                    />
                    <YAxis
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Line
                      type="monotone"
                      dataKey="days"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-muted-foreground text-sm">{label}</div>
        <div className="mt-1 text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  )
}

// ─── Payroll ────────────────────────────────────────────────────────────────

const ALL_DEPTS = "__all__"

function PayrollStats() {
  const [year, setYear] = React.useState<number | undefined>(undefined)
  const [dept, setDept] = React.useState<string>(ALL_DEPTS)
  const data = useQuery(api.reports.payroll, {
    ...(year !== undefined ? { year } : {}),
    ...(dept !== ALL_DEPTS ? { departmentId: dept as Id<"departments"> } : {}),
  })

  const config: ChartConfig = {
    basicCents: { label: "Basic Salary", color: "#f59e0b" },
    allowancesCents: { label: "Allowances", color: "#8b5cf6" },
    employerCpfCents: { label: "Employer CPF", color: "#ef4444" },
  }

  function exportMonthly() {
    if (!data) return
    const headers = ["Month", "Basic", "Allowances", "Employer CPF"]
    const rows: CsvCell[][] = data.monthly.map((m) => [
      m.month,
      (m.basicCents / 100).toFixed(2),
      (m.allowancesCents / 100).toFixed(2),
      (m.employerCpfCents / 100).toFixed(2),
    ])
    downloadFile(
      `payroll-statistics-${data.year}.csv`,
      toCsv(headers, rows),
      "text/csv;charset=utf-8",
    )
  }

  if (data === undefined) return <Skeleton className="h-96 w-full" />
  if (data === null)
    return <EmptyState label="No payroll data available." />

  const { ytd, comparison, currency } = data
  const up = comparison.deltaCents >= 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Year</span>
          <YearSelect
            value={data.year}
            onChange={setYear}
            options={data.years}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Department</span>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Overall" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_DEPTS}>Overall</SelectItem>
              {data.departments.map((d) => (
                <SelectItem key={d._id} value={d._id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Payroll Expenses</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <Metric label="YTD Total Payout" value={money(ytd.totalPayoutCents, currency)} />
            <Metric label="YTD Total Paid To Employee" value={money(ytd.totalPaidCents, currency)} />
            <Metric label="YTD Total Employee CPF" value={money(ytd.employeeCpfCents, currency)} />
            <Metric label="YTD Total Employer CPF" value={money(ytd.employerCpfCents, currency)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payroll Comparison</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <div className="text-muted-foreground text-sm">
                Last Month&apos;s Comparison
              </div>
              <div
                className={cn(
                  "flex items-center gap-1 text-2xl font-semibold",
                  up ? "text-red-500" : "text-emerald-600",
                )}
              >
                {up ? (
                  <IconArrowUp className="size-5" />
                ) : (
                  <IconArrowDown className="size-5" />
                )}
                {comparison.pct == null ? "—" : `${Math.abs(comparison.pct)}%`}
              </div>
              <div
                className={cn(
                  "text-sm",
                  up ? "text-red-500" : "text-emerald-600",
                )}
              >
                {up ? "+" : "−"}
                {money(Math.abs(comparison.deltaCents), currency)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Metric
                label={comparison.currentLabel ?? "Current"}
                value={money(comparison.currentCents, currency)}
              />
              <Metric
                label={comparison.prevLabel ?? "Previous"}
                value={money(comparison.prevCents, currency)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Monthly Payroll Breakdown</CardTitle>
          <Button variant="outline" size="sm" onClick={exportMonthly}>
            <IconDownload className="size-4" />
            Export
          </Button>
        </CardHeader>
        <CardContent>
          <ChartContainer config={config} className="h-80 w-full">
            <BarChart data={data.monthly}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                fontSize={12}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `${Math.round(v / 100000)}k`}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value, name) => (
                      <span>
                        {config[name as string]?.label ?? name}:{" "}
                        {money(Number(value), currency)}
                      </span>
                    )}
                  />
                }
              />
              <Legend />
              <Bar dataKey="basicCents" stackId="a" fill="#f59e0b" />
              <Bar dataKey="allowancesCents" stackId="a" fill="#8b5cf6" />
              <Bar dataKey="employerCpfCents" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground text-sm">{label}</div>
      <div className="mt-0.5 text-xl font-semibold">{value}</div>
    </div>
  )
}

function YearSelect({
  value,
  onChange,
  options,
}: {
  value: number
  onChange: (year: number) => void
  options: number[]
}) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger className="w-28">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((y) => (
          <SelectItem key={y} value={String(y)}>
            {y}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
