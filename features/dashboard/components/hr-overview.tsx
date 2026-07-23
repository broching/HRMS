"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Label,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts"
import {
  IconUsers,
  IconUserPlus,
  IconUserMinus,
  IconArrowsExchange,
  IconPlaneDeparture,
  IconReceipt2,
  IconTrendingUp,
  IconArrowUpRight,
  IconArrowDownRight,
  IconAlertTriangle,
  IconClockExclamation,
  IconFileText,
  type Icon,
} from "@tabler/icons-react"
import type { FunctionReturnType } from "convex/server"
import { api } from "@/convex/_generated/api"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

// ── Period lens ──────────────────────────────────────────────────────────────
// One control drives the whole board. Presets resolve to an ISO [start,end]
// window; the queries read only within it.

type RangeKey = "today" | "7d" | "30d" | "3m" | "12m" | "custom"

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "3m", label: "3 months" },
  { key: "12m", label: "12 months" },
  { key: "custom", label: "Custom" },
]

const todayIso = () => new Date().toISOString().slice(0, 10)
function shiftIso(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
}
function presetWindow(key: Exclude<RangeKey, "custom">): { start: string; end: string } {
  const end = todayIso()
  switch (key) {
    case "today": return { start: end, end }
    case "7d": return { start: shiftIso(-6), end }
    case "30d": return { start: shiftIso(-29), end }
    case "3m": return { start: shiftIso(-89), end }
    case "12m": return { start: shiftIso(-364), end }
  }
}

// ── palette (theme-agnostic mid-saturation; distinct on light & dark) ─────────
const SERIES = {
  headcount: "var(--chart-1)",
  hires: "#10b981",
  exits: "#f43f5e",
}
const CATEGORICAL = [
  "#6366f1", "#f59e0b", "#10b981", "#ec4899", "#06b6d4",
  "#8b5cf6", "#f43f5e", "#84cc16", "#0ea5e9", "#f97316",
]

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
function moneyCompact(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(cents / 100)
  } catch {
    return `${Math.round(cents / 100)}`
  }
}
function num(n: number): string {
  return n.toLocaleString()
}

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  probation: "Probation",
  on_leave: "On leave",
  suspended: "Suspended",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  info_requested: "Info requested",
  draft: "Draft",
  pending_manager: "Pending manager",
  pending_finance: "Pending finance",
  reimbursed: "Reimbursed",
}
const TYPE_LABELS: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  intern: "Intern",
}
const GENDER_LABELS: Record<string, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
  undisclosed: "Undisclosed",
}

// ─── Root ────────────────────────────────────────────────────────────────────

export function HrOverview() {
  const [range, setRange] = React.useState<RangeKey>("30d")
  const [custom, setCustom] = React.useState({ start: shiftIso(-29), end: todayIso() })

  const period =
    range === "custom"
      ? { start: custom.start, end: custom.end }
      : presetWindow(range)

  // Two queries, split by churn: workforce (one employee scan) vs activity
  // (window-scoped leave/claims/payments). See convex/hrDashboard.ts.
  const wf = useQuery(api.hrDashboard.workforce, period)
  const act = useQuery(api.hrDashboard.activity, period)

  return (
    <div className="flex flex-col gap-5 px-4 lg:px-6">
      <RangeControl
        range={range}
        onRange={setRange}
        custom={custom}
        onCustom={setCustom}
      />

      <KpiRail wf={wf} act={act} />

      {act?.attention &&
        (act.attention.pendingLeave +
          act.attention.pendingClaims +
          act.attention.expiringDocs >
          0) && <AttentionStrip attention={act.attention} />}

      {/* Hero: workforce trajectory + composition */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TrajectoryCard wf={wf} />
        </div>
        <CompositionCard wf={wf} />
      </div>

      {/* People breakdowns */}
      <div className="grid gap-4 lg:grid-cols-2">
        <DepartmentCard wf={wf} />
        <TenureCard wf={wf} />
      </div>

      {/* Activity: leave + claims */}
      <div className="grid gap-4 lg:grid-cols-2">
        <LeaveCard act={act} />
        <ClaimsCard act={act} />
      </div>
    </div>
  )
}

type Wf = NonNullable<FunctionReturnType<typeof api.hrDashboard.workforce>>
type Act = NonNullable<FunctionReturnType<typeof api.hrDashboard.activity>>

// ─── Range control ───────────────────────────────────────────────────────────

function RangeControl({
  range,
  onRange,
  custom,
  onCustom,
}: {
  range: RangeKey
  onRange: (r: RangeKey) => void
  custom: { start: string; end: string }
  onCustom: (c: { start: string; end: string }) => void
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground text-sm">
        Your organization at a glance — headcount, movement, leave and spend for
        the selected period.
      </p>
      <div className="flex flex-col items-stretch gap-2 sm:items-end">
        <div className="bg-muted/60 inline-flex w-full flex-wrap rounded-lg p-0.5 sm:w-auto">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => onRange(r.key)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors sm:flex-none",
                range === r.key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
        {range === "custom" && (
          <div className="flex items-center gap-2 text-sm">
            <input
              type="date"
              value={custom.start}
              max={custom.end}
              onChange={(e) => onCustom({ ...custom, start: e.target.value })}
              className="border-input bg-background rounded-md border px-2 py-1"
            />
            <span className="text-muted-foreground">→</span>
            <input
              type="date"
              value={custom.end}
              min={custom.start}
              max={todayIso()}
              onChange={(e) => onCustom({ ...custom, end: e.target.value })}
              className="border-input bg-background rounded-md border px-2 py-1"
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── KPI rail ────────────────────────────────────────────────────────────────

function KpiRail({ wf, act }: { wf: Wf | undefined | null; act: Act | undefined | null }) {
  const currency = act?.currency ?? "SGD"
  const hcSpark = wf?.trend.map((t) => t.headcount) ?? []
  const hireSpark = wf?.trend.map((t) => t.hires) ?? []
  const exitSpark = wf?.trend.map((t) => t.exits) ?? []
  const claimSpark = act?.claims.trend.map((t) => t.cents / 100) ?? []

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <KpiTile
        icon={IconUsers}
        label="Active headcount"
        value={wf ? num(wf.headcount) : undefined}
        delta={wf?.netChange}
        deltaGood
        deltaSuffix=" this period"
        spark={hcSpark}
        sparkColor={SERIES.headcount}
      />
      <KpiTile
        icon={IconUserPlus}
        label="New hires"
        value={wf ? num(wf.hires) : undefined}
        delta={wf?.hiresDelta}
        deltaGood
        spark={hireSpark}
        sparkColor={SERIES.hires}
      />
      <KpiTile
        icon={IconUserMinus}
        label="Leavers"
        value={wf ? num(wf.exits) : undefined}
        delta={wf?.exitsDelta}
        deltaGood={false}
        spark={exitSpark}
        sparkColor={SERIES.exits}
      />
      <KpiTile
        icon={IconArrowsExchange}
        label="Turnover"
        value={wf ? `${wf.turnoverPct}%` : undefined}
        hint="of avg. headcount"
      />
      <KpiTile
        icon={IconPlaneDeparture}
        label="Leave days approved"
        value={act ? num(act.leave.approvedDays) : undefined}
        hint={act ? `${num(act.leave.total)} requests` : undefined}
      />
      <KpiTile
        icon={IconReceipt2}
        label="Claim spend"
        value={act ? money(act.claims.approvedCents, currency) : undefined}
        hint={
          act && act.claims.pendingCents > 0
            ? `${money(act.claims.pendingCents, currency)} pending`
            : undefined
        }
        spark={claimSpark}
        sparkColor={CATEGORICAL[1]}
      />
    </div>
  )
}

function KpiTile({
  icon: Icon,
  label,
  value,
  delta,
  deltaGood,
  deltaSuffix,
  hint,
  spark,
  sparkColor,
}: {
  icon: Icon
  label: string
  value: string | undefined
  delta?: number
  deltaGood?: boolean
  deltaSuffix?: string
  hint?: string
  spark?: number[]
  sparkColor?: string
}) {
  const showDelta = delta !== undefined && delta !== 0
  const good = delta !== undefined && delta > 0 === !!deltaGood
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex items-center gap-2">
          <div className="bg-primary/10 text-primary flex size-7 items-center justify-center rounded-md">
            <Icon className="size-4" />
          </div>
          <span className="text-muted-foreground truncate text-xs font-medium">
            {label}
          </span>
        </div>

        {value === undefined ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <div className="text-2xl font-semibold tracking-tight tabular-nums">
            {value}
          </div>
        )}

        <div className="flex min-h-4 items-center gap-1.5 text-xs">
          {showDelta ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium",
                good ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
              )}
            >
              {delta! > 0 ? (
                <IconArrowUpRight className="size-3.5" />
              ) : (
                <IconArrowDownRight className="size-3.5" />
              )}
              {Math.abs(delta!)}
              {deltaSuffix ?? " vs prior"}
            </span>
          ) : hint ? (
            <span className="text-muted-foreground">{hint}</span>
          ) : null}
        </div>

        {spark && spark.length > 1 && (
          <div className="pointer-events-none absolute right-0 bottom-0 h-10 w-24 opacity-70">
            <Sparkline data={spark} color={sparkColor ?? SERIES.headcount} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const rows = data.map((v, i) => ({ i, v }))
  const id = React.useId().replace(/:/g, "")
  return (
    <ChartContainer config={{}} className="h-full w-full">
      <AreaChart data={rows} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#sp-${id})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}

// ─── Attention strip ─────────────────────────────────────────────────────────

function AttentionStrip({ attention }: { attention: Act["attention"] }) {
  const items: { icon: Icon; label: string; value: number; href: string; tone: string }[] = []
  if (attention.pendingLeave > 0)
    items.push({
      icon: IconClockExclamation,
      label: "leave requests awaiting approval",
      value: attention.pendingLeave,
      href: "/hr-lounge/leave",
      tone: "text-amber-600 dark:text-amber-400",
    })
  if (attention.pendingClaims > 0)
    items.push({
      icon: IconReceipt2,
      label: "claims awaiting approval",
      value: attention.pendingClaims,
      href: "/hr-lounge/claims",
      tone: "text-sky-600 dark:text-sky-400",
    })
  if (attention.expiringDocs > 0)
    items.push({
      icon: IconFileText,
      label: "documents expiring within 60 days",
      value: attention.expiringDocs,
      href: "/hr-lounge",
      tone: "text-rose-600 dark:text-rose-400",
    })

  const fmt = (n: number) => (n >= attention.cappedAt ? `${n}+` : String(n))

  return (
    <Card className="border-amber-500/30 bg-amber-500/[0.03]">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex items-center gap-2 text-sm font-medium">
          <IconAlertTriangle className="size-4 text-amber-500" />
          Needs attention
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {items.map((it) => (
            <Link
              key={it.label}
              href={it.href}
              className="group flex items-center gap-2 text-sm"
            >
              <it.icon className={cn("size-4", it.tone)} />
              <span className="font-semibold tabular-nums">{fmt(it.value)}</span>
              <span className="text-muted-foreground group-hover:text-foreground transition-colors">
                {it.label}
              </span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Chart shell ─────────────────────────────────────────────────────────────

function ChartShell({
  title,
  subtitle,
  action,
  loading,
  empty,
  children,
  className,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  loading?: boolean
  empty?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <Card className={className}>
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">{title}</h3>
            {subtitle && (
              <p className="text-muted-foreground text-xs">{subtitle}</p>
            )}
          </div>
          {action}
        </div>
        {loading ? (
          <Skeleton className="h-64 w-full flex-1" />
        ) : empty ? (
          <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 py-10 text-sm">
            <IconTrendingUp className="size-5 opacity-50" />
            No data for this period.
          </div>
        ) : (
          <div className="flex-1">{children}</div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Workforce trajectory (hero) ─────────────────────────────────────────────

function TrajectoryCard({ wf }: { wf: Wf | undefined | null }) {
  const config: ChartConfig = {
    headcount: { label: "Headcount", color: "var(--chart-1)" },
    hires: { label: "Joiners", color: SERIES.hires },
    exits: { label: "Leavers", color: SERIES.exits },
  }
  return (
    <ChartShell
      title="Workforce trajectory"
      subtitle="Headcount with joiners and leavers by month"
      loading={!wf}
      className="h-full"
      action={
        wf && (
          <div className="hidden gap-4 sm:flex">
            <Legend swatch={SERIES.hires} label="Joiners" />
            <Legend swatch={SERIES.exits} label="Leavers" />
          </div>
        )
      }
    >
      {wf && (
        <ChartContainer config={config} className="h-[280px] w-full">
          <ComposedChart data={wf.trend} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="hc-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.28} />
                <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={36} fontSize={11} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="hires" fill={SERIES.hires} radius={[2, 2, 0, 0]} maxBarSize={22} />
            <Bar dataKey="exits" fill={SERIES.exits} radius={[2, 2, 0, 0]} maxBarSize={22} />
            <Area
              type="monotone"
              dataKey="headcount"
              stroke="var(--chart-1)"
              strokeWidth={2.5}
              fill="url(#hc-fill)"
            />
          </ComposedChart>
        </ChartContainer>
      )}
    </ChartShell>
  )
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <span className="size-2.5 rounded-[3px]" style={{ background: swatch }} />
      {label}
    </span>
  )
}

// ─── Composition donut (employment type) ─────────────────────────────────────

function CompositionCard({ wf }: { wf: Wf | undefined | null }) {
  const data =
    wf?.byType.map((t, i) => ({
      name: TYPE_LABELS[t.type] ?? t.type,
      value: t.count,
      fill: CATEGORICAL[i % CATEGORICAL.length],
    })) ?? []
  const total = data.reduce((n, d) => n + d.value, 0)
  const config: ChartConfig = Object.fromEntries(
    data.map((d) => [d.name, { label: d.name, color: d.fill }]),
  )

  return (
    <ChartShell
      title="Composition"
      subtitle="Active staff by employment type"
      loading={!wf}
      empty={!!wf && total === 0}
      className="h-full"
    >
      {wf && total > 0 && (
        <div className="flex flex-col items-center gap-4">
          <ChartContainer config={config} className="h-[180px] w-full">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={54}
                outerRadius={80}
                strokeWidth={2}
              >
                {data.map((d) => (
                  <Cell key={d.name} fill={d.fill} />
                ))}
                <Label
                  content={({ viewBox }) => {
                    if (!viewBox || !("cx" in viewBox)) return null
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className="fill-foreground text-2xl font-semibold"
                        >
                          {total}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy ?? 0) + 18}
                          className="fill-muted-foreground text-xs"
                        >
                          staff
                        </tspan>
                      </text>
                    )
                  }}
                />
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="grid w-full grid-cols-2 gap-x-4 gap-y-1.5">
            {data.map((d) => (
              <div key={d.name} className="flex items-center gap-2 text-xs">
                <span className="size-2.5 rounded-full" style={{ background: d.fill }} />
                <span className="text-muted-foreground truncate">{d.name}</span>
                <span className="ml-auto font-medium tabular-nums">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </ChartShell>
  )
}

// ─── By department ───────────────────────────────────────────────────────────

function DepartmentCard({ wf }: { wf: Wf | undefined | null }) {
  const data = wf?.byDepartment.slice(0, 8) ?? []
  const config: ChartConfig = { count: { label: "Employees", color: "var(--chart-1)" } }
  return (
    <ChartShell
      title="Headcount by department"
      subtitle="Active staff across the org"
      loading={!wf}
      empty={!!wf && data.length === 0}
    >
      {wf && data.length > 0 && (
        <ChartContainer config={config} className="w-full" style={{ height: Math.max(180, data.length * 38) }}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
            <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
            <YAxis
              type="category"
              dataKey="name"
              tickLine={false}
              axisLine={false}
              width={110}
              fontSize={11}
            />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={26}>
              {data.map((_, i) => (
                <Cell key={i} fill={CATEGORICAL[i % CATEGORICAL.length]} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </ChartShell>
  )
}

// ─── Tenure ──────────────────────────────────────────────────────────────────

function TenureCard({ wf }: { wf: Wf | undefined | null }) {
  const data = wf?.byTenure ?? []
  const total = data.reduce((n, d) => n + d.count, 0)
  const config: ChartConfig = { count: { label: "Employees", color: "var(--chart-1)" } }
  return (
    <ChartShell
      title="Tenure distribution"
      subtitle="Years of service across active staff"
      loading={!wf}
      empty={!!wf && total === 0}
    >
      {wf && total > 0 && (
        <ChartContainer config={config} className="h-[240px] w-full">
          <BarChart data={data} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="group" tickLine={false} axisLine={false} fontSize={11} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} fontSize={11} />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} cursor={{ fill: "var(--muted)", opacity: 0.4 }} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={56}>
              {data.map((_, i) => (
                <Cell key={i} fill={CATEGORICAL[i % CATEGORICAL.length]} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </ChartShell>
  )
}

// ─── Leave ───────────────────────────────────────────────────────────────────

function LeaveCard({ act }: { act: Act | undefined | null }) {
  const data = act?.leave.byType.slice(0, 6) ?? []
  const total = data.reduce((n, d) => n + d.days, 0)
  const config: ChartConfig = Object.fromEntries(
    data.map((d) => [d.name, { label: d.name, color: d.color }]),
  )
  return (
    <ChartShell
      title="Leave taken"
      subtitle="Approved leave days by type"
      loading={!act}
      empty={!!act && total === 0}
    >
      {act && total > 0 && (
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <ChartContainer config={config} className="h-[180px] w-full sm:w-1/2">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Pie data={data} dataKey="days" nameKey="name" innerRadius={48} outerRadius={78} strokeWidth={2}>
                {data.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
                <Label
                  content={({ viewBox }) => {
                    if (!viewBox || !("cx" in viewBox)) return null
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle">
                        <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-xl font-semibold">
                          {Math.round(total * 10) / 10}
                        </tspan>
                        <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 16} className="fill-muted-foreground text-[10px]">
                          days
                        </tspan>
                      </text>
                    )
                  }}
                />
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="flex w-full flex-col gap-1.5 sm:w-1/2">
            {data.map((d) => (
              <div key={d.name} className="flex items-center gap-2 text-xs">
                <span className="size-2.5 rounded-full" style={{ background: d.color }} />
                <span className="text-muted-foreground truncate">{d.name}</span>
                <span className="ml-auto font-medium tabular-nums">{d.days}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </ChartShell>
  )
}

// ─── Claims ──────────────────────────────────────────────────────────────────

const CLAIM_CAT_LABELS: Record<string, string> = {
  medical: "Medical",
  travel: "Travel",
  meals: "Meals",
  office: "Office",
  mileage: "Mileage",
  training: "Training",
  entertainment: "Entertainment",
  custom: "Other",
  other: "Other",
}

function ClaimsCard({ act }: { act: Act | undefined | null }) {
  const currency = act?.currency ?? "SGD"
  const trend = act?.claims.trend ?? []
  const cats = act?.claims.byCategory.slice(0, 6) ?? []
  const hasTrend = trend.length > 1
  const config: ChartConfig = { cents: { label: "Approved", color: CATEGORICAL[1] } }
  const catTotal = cats.reduce((n, c) => n + c.cents, 0)

  return (
    <ChartShell
      title="Claim spend"
      subtitle="Approved expense claims for the period"
      loading={!act}
      empty={!!act && act.claims.approvedCents === 0}
    >
      {act && act.claims.approvedCents > 0 && (
        <div className="flex flex-col gap-4">
          {hasTrend ? (
            <ChartContainer config={config} className="h-[160px] w-full">
              <AreaChart data={trend} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="claim-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CATEGORICAL[1]} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CATEGORICAL[1]} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  fontSize={11}
                  tickFormatter={(v: number) => moneyCompact(v, currency)}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => (
                        <span className="font-medium">{money(Number(value), currency)}</span>
                      )}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="cents"
                  stroke={CATEGORICAL[1]}
                  strokeWidth={2.5}
                  fill="url(#claim-fill)"
                />
              </AreaChart>
            </ChartContainer>
          ) : (
            <div className="text-2xl font-semibold tracking-tight">
              {money(act.claims.approvedCents, currency)}
              <span className="text-muted-foreground ml-2 text-sm font-normal">
                approved this period
              </span>
            </div>
          )}

          {cats.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {cats.map((c, i) => {
                const label = CLAIM_CAT_LABELS[c.category] ?? c.category
                const pct = catTotal > 0 ? (c.cents / catTotal) * 100 : 0
                return (
                  <div key={c.category} className="flex items-center gap-2 text-xs">
                    <span className="w-24 truncate">{label}</span>
                    <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: CATEGORICAL[i % CATEGORICAL.length] }}
                      />
                    </div>
                    <span className="w-16 text-right font-medium tabular-nums">
                      {money(c.cents, currency)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </ChartShell>
  )
}
