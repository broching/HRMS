"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery, useMutation } from "convex/react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  IconArrowLeft,
  IconBuilding,
  IconUsers,
  IconUserCheck,
  IconUserX,
  IconCreditCard,
  IconPuzzle,
  IconChartHistogram,
  IconFiles,
  IconAlertTriangle,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { formatSgd } from "@/convex/lib/plans"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Shell,
  AccessDenied,
} from "@/features/super-admin/components/super-admin-console"

// Categorical palette tuned for the dark slate console shell (not app tokens).
const PALETTE = [
  "#38bdf8", // sky
  "#34d399", // emerald
  "#a78bfa", // violet
  "#fbbf24", // amber
  "#fb7185", // rose
  "#22d3ee", // cyan
  "#f472b6", // pink
  "#a3e635", // lime
]

export function OrgDetail({ orgId }: { orgId: Id<"organizations"> }) {
  const me = useQuery(api.superAdmin.whoami)

  if (me === undefined) {
    return (
      <Shell>
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="border-primary/30 border-t-primary size-8 animate-spin rounded-full border-2" />
        </div>
      </Shell>
    )
  }
  if (!me.isSuperAdmin) {
    return (
      <Shell>
        <AccessDenied subject={me.subject} email={me.email} />
      </Shell>
    )
  }
  return (
    <Shell name={me.name ?? me.email}>
      <Detail orgId={orgId} />
    </Shell>
  )
}

function Detail({ orgId }: { orgId: Id<"organizations"> }) {
  const detail = useQuery(api.superAdmin.orgDetail, { orgId })

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/super-admin"
        className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1.5 text-sm"
      >
        <IconArrowLeft className="size-4" /> All organizations
      </Link>

      {detail === undefined ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-64 rounded-xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                <IconBuilding className="text-muted-foreground size-6" />
                {detail.org.name}
              </h1>
              <p className="text-muted-foreground mt-1 text-sm">
                {detail.org.slug ? `/${detail.org.slug} · ` : ""}
                {detail.org.country} · created {formatDate(detail.org.createdAt)}
              </p>
            </div>
            <div className="flex gap-2">
              <HeadStat
                label="Members"
                value={detail.org.memberCount.toLocaleString()}
              />
              <HeadStat
                label="Active staff"
                value={detail.org.activeEmployees.toLocaleString()}
              />
            </div>
          </div>

          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">
                <IconCreditCard className="size-4" /> Overview
              </TabsTrigger>
              <TabsTrigger value="analytics">
                <IconChartHistogram className="size-4" /> Analytics
              </TabsTrigger>
              <TabsTrigger value="modules">
                <IconPuzzle className="size-4" /> Modules
              </TabsTrigger>
              <TabsTrigger value="members">
                <IconUsers className="size-4" /> Members
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4">
              <BillingCard billing={detail.billing} />
            </TabsContent>
            <TabsContent value="analytics" className="mt-4">
              <Analytics orgId={orgId} />
            </TabsContent>
            <TabsContent value="modules" className="mt-4">
              <ModulesPanel orgId={orgId} modules={detail.modules} />
            </TabsContent>
            <TabsContent value="members" className="mt-4">
              <Members orgId={orgId} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}

// ─── Overview: billing ───────────────────────────────────────────────────────

function BillingCard({
  billing,
}: {
  billing: {
    plan: string | null
    planName: string | null
    status: string | null
    seats: number | null
    priceCents: number | null
    currentPeriodEnd: number | null
    cancelAtPeriodEnd: boolean
    hasStripeCustomer: boolean
    hasSubscription: boolean
  }
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-2">
        <IconCreditCard className="text-muted-foreground size-5" />
        <h2 className="font-semibold">Billing</h2>
        {billing.cancelAtPeriodEnd && (
          <Badge
            variant="outline"
            className="border-amber-500/40 text-amber-600 dark:text-amber-400"
          >
            Cancels at period end
          </Badge>
        )}
      </div>

      {!billing.hasSubscription ? (
        <p className="text-muted-foreground text-sm">
          No active Stripe subscription.
          {billing.hasStripeCustomer
            ? " A Stripe customer exists but no subscription is attached yet."
            : " This org has never started checkout."}
        </p>
      ) : (
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Plan" value={billing.planName ?? billing.plan ?? "—"} />
          <Field
            label="Status"
            value={
              billing.status ? (
                <span className="capitalize">
                  {billing.status.replace("_", " ")}
                </span>
              ) : (
                "—"
              )
            }
          />
          <Field
            label="Monthly price"
            value={
              billing.priceCents != null ? formatSgd(billing.priceCents) : "—"
            }
            accent
          />
          <Field label="Seats" value={billing.seats?.toLocaleString() ?? "—"} />
          <Field
            label="Renews"
            value={
              billing.currentPeriodEnd
                ? formatDate(billing.currentPeriodEnd)
                : "—"
            }
          />
          <Field
            label="Stripe customer"
            value={billing.hasStripeCustomer ? "Linked" : "None"}
          />
        </dl>
      )}
    </div>
  )
}

function Field({
  label,
  value,
  accent,
}: {
  label: string
  value: React.ReactNode
  accent?: boolean
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 text-sm font-semibold tabular-nums",
          accent && "text-primary",
        )}
      >
        {value}
      </dd>
    </div>
  )
}

// ─── Analytics ───────────────────────────────────────────────────────────────

function Analytics({ orgId }: { orgId: Id<"organizations"> }) {
  const data = useQuery(api.superAdmin.orgAnalytics, { orgId })

  if (data === undefined) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-72 rounded-2xl" />
        ))}
      </div>
    )
  }

  const records = data.recordsByModule.filter((r) => r.count > 0)
  const anyActivity = data.activity.some((a) => a.count > 0)

  return (
    <div className="flex flex-col gap-4">
      {/* Headline tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          icon={<IconUsers className="size-5" />}
          label="Members"
          value={data.totals.members.toLocaleString()}
        />
        <Tile
          icon={<IconUserCheck className="size-5" />}
          label="Active employees"
          value={data.totals.activeEmployees.toLocaleString()}
        />
        <Tile
          icon={<IconUserX className="size-5" />}
          label="Terminated"
          value={data.totals.terminatedEmployees.toLocaleString()}
        />
        <Tile
          icon={<IconFiles className="size-5" />}
          label="Documents stored"
          value={data.storage.documents.toLocaleString()}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Headcount over time" subtitle="Active staff, last 12 months">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={data.headcount} margin={CHART_MARGIN}>
              <defs>
                <linearGradient id="hc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={PALETTE[0]} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={PALETTE[0]} stopOpacity={0} />
                </linearGradient>
              </defs>
              {grid()}
              <XAxis dataKey="month" tickFormatter={shortMonth} {...axisProps} />
              <YAxis allowDecimals={false} {...axisProps} width={28} />
              <Tooltip content={<DarkTooltip />} />
              <Area
                type="monotone"
                dataKey="active"
                name="Active staff"
                stroke={PALETTE[0]}
                fill="url(#hc)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Hiring activity"
          subtitle="Joiners vs leavers, last 12 months"
        >
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.headcount} margin={CHART_MARGIN}>
              {grid()}
              <XAxis dataKey="month" tickFormatter={shortMonth} {...axisProps} />
              <YAxis allowDecimals={false} {...axisProps} width={28} />
              <Tooltip content={<DarkTooltip />} cursor={{ fill: "#ffffff08" }} />
              <Bar dataKey="hires" name="Hires" fill={PALETTE[1]} radius={[3, 3, 0, 0]} />
              <Bar dataKey="exits" name="Exits" fill={PALETTE[4]} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Records by module"
          subtitle="Resource consumption across the org's data"
        >
          {records.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, records.length * 34)}>
              <BarChart
                data={records}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
              >
                {grid(true)}
                <XAxis type="number" allowDecimals={false} {...axisProps} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={130}
                  {...axisProps}
                />
                <Tooltip content={<DarkTooltip />} cursor={{ fill: "#ffffff08" }} />
                <Bar dataKey="count" name="Records" radius={[0, 3, 3, 0]}>
                  {records.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard
          title="Activity trend"
          subtitle="Records created per month (leave, claims, attendance, timesheets)"
        >
          {anyActivity ? (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={data.activity} margin={CHART_MARGIN}>
                {grid()}
                <XAxis dataKey="month" tickFormatter={shortMonth} {...axisProps} />
                <YAxis allowDecimals={false} {...axisProps} width={28} />
                <Tooltip content={<DarkTooltip />} />
                <Line
                  type="monotone"
                  dataKey="count"
                  name="Records created"
                  stroke={PALETTE[2]}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Empty />
          )}
        </ChartCard>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile
          icon={<IconFiles className="size-5" />}
          label="Employee documents"
          value={data.storage.documents.toLocaleString()}
        />
        <Tile
          icon={<IconFiles className="size-5" />}
          label="Saved signatures"
          value={data.storage.signatures.toLocaleString()}
        />
        <Tile
          icon={<IconFiles className="size-5" />}
          label="Feed attachments"
          value={data.storage.feedAttachments.toLocaleString()}
        />
      </div>
    </div>
  )
}

// ─── Modules (system configuration) ──────────────────────────────────────────

function ModulesPanel({
  orgId,
  modules,
}: {
  orgId: Id<"organizations">
  modules: {
    key: string
    name: string
    description: string
    always: boolean
    enabled: boolean
  }[]
}) {
  const setModules = useMutation(api.superAdmin.setOrgModules)
  const [saving, setSaving] = React.useState<string | null>(null)

  async function toggle(key: string, next: boolean) {
    // Rebuild the disabled set from current enabled state, applying the change.
    const disabled = modules
      .filter((m) => !m.always && (m.key === key ? !next : !m.enabled))
      .map((m) => m.key)
    setSaving(key)
    try {
      await setModules({ orgId, disabled })
      toast.success(
        `${modules.find((m) => m.key === key)?.name} ${next ? "enabled" : "disabled"}`,
      )
    } catch {
      toast.error("Couldn't update modules.")
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-start gap-2 border-b border-border p-5">
        <IconPuzzle className="text-muted-foreground mt-0.5 size-5" />
        <div>
          <h2 className="font-semibold">System configuration — modules</h2>
          <p className="text-muted-foreground text-sm">
            Toggle the features this organization has access to. Changes take
            effect on the org&apos;s next page load.
          </p>
        </div>
      </div>
      <ul className="divide-y divide-border">
        {modules.map((m) => (
          <li
            key={m.key}
            className="flex items-center justify-between gap-4 px-5 py-4"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-medium">
                {m.name}
                {m.always && (
                  <Badge variant="secondary" className="text-[10px]">
                    Always on
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground text-sm">{m.description}</p>
            </div>
            <Switch
              checked={m.enabled}
              disabled={m.always || saving === m.key}
              onCheckedChange={(v) => toggle(m.key, v)}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── Members ─────────────────────────────────────────────────────────────────

function Members({ orgId }: { orgId: Id<"organizations"> }) {
  const users = useQuery(api.superAdmin.orgUsers, { orgId })

  if (users === undefined) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    )
  }
  if (users.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No members in this organization.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {users.map((u) => (
        <div
          key={u.memberId}
          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{u.name}</div>
            <div className="text-muted-foreground truncate text-xs">
              {u.email ?? (u.username ? `@${u.username}` : "—")}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="outline" className="capitalize">
              {u.roleName ?? u.role}
            </Badge>
            {u.status !== "active" && (
              <span className="text-muted-foreground text-[11px] capitalize">
                {u.status}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Bits ────────────────────────────────────────────────────────────────────

const CHART_MARGIN = { top: 8, right: 12, left: 0, bottom: 4 }
const axisProps = {
  stroke: "#64748b",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const

function grid(vertical = false) {
  return (
    <CartesianGrid
      strokeDasharray="3 3"
      stroke="#ffffff12"
      horizontal={!vertical}
      vertical={vertical}
    />
  )
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && (
          <p className="text-muted-foreground text-xs">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  )
}

function Tile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="bg-muted text-muted-foreground flex size-8 items-center justify-center rounded-lg">
        {icon}
      </div>
      <div className="mt-2 text-xl font-bold tracking-tight tabular-nums">
        {value}
      </div>
      <div className="text-muted-foreground text-xs font-medium">{label}</div>
    </div>
  )
}

function HeadStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-2 text-right shadow-sm">
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-muted-foreground text-[11px] font-medium">
        {label}
      </div>
    </div>
  )
}

function Empty() {
  return (
    <div className="text-muted-foreground flex h-40 flex-col items-center justify-center gap-2 text-sm">
      <IconAlertTriangle className="size-5 opacity-60" />
      No data yet.
    </div>
  )
}

interface TooltipEntry {
  name?: string
  value?: number | string
  color?: string
}

function DarkTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TooltipEntry[]
  label?: string
}) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 shadow-lg">
      {label && <div className="mb-1 font-medium">{shortMonth(label)}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="size-2 rounded-full"
            style={{ background: p.color }}
          />
          <span className="text-slate-400">{p.name}</span>
          <span className="ml-auto font-semibold tabular-nums">{p.value}</span>
        </div>
      ))}
    </div>
  )
}

function shortMonth(m: string): string {
  // "YYYY-MM" → "Mon 'YY"
  if (!/^\d{4}-\d{2}$/.test(m)) return m
  const [y, mo] = m.split("-")
  const d = new Date(Number(y), Number(mo) - 1, 1)
  return d.toLocaleDateString("en-SG", { month: "short", year: "2-digit" })
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}
