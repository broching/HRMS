"use client"

import * as React from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { useQuery, useMutation, useAction } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { toast } from "sonner"
import {
  IconShieldLock,
  IconBuilding,
  IconUsers,
  IconUserCheck,
  IconRosetteDiscountCheck,
  IconCoin,
  IconSearch,
  IconExternalLink,
  IconArrowLeft,
  IconMail,
  IconArchive,
  IconCheck,
  IconInbox,
  IconServer,
  IconRefresh,
  IconCircleCheck,
} from "@tabler/icons-react"
import { formatSgd } from "@/convex/lib/plans"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export function SuperAdminConsole() {
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

  // Anyone who isn't a super admin gets a plain 404 — the console simply does
  // not exist for them. We deliberately do NOT render a "restricted / here's
  // your user id" helper: that would echo the caller's Clerk user id back and
  // advertise the allow-list. Authorization is still enforced server-side on
  // every Convex query regardless of what the client renders.
  if (!me.isSuperAdmin) {
    notFound()
  }

  return (
    <Shell name={me.name ?? me.email}>
      <Dashboard />
    </Shell>
  )
}

// ─── Chrome ──────────────────────────────────────────────────────────────────

export function Shell({
  children,
  name,
}: {
  children: React.ReactNode
  name?: string | null
}) {
  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950 text-slate-100">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-2.5">
            <IconShieldLock className="size-5 text-sky-400" />
            <span className="font-semibold tracking-tight">
              Platform Console
            </span>
            <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-semibold tracking-[0.14em] text-slate-400 uppercase">
              Super Admin
            </span>
          </div>
          <div className="flex items-center gap-3">
            {name && (
              <span className="hidden text-sm text-slate-400 sm:inline">
                {name}
              </span>
            )}
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <IconArrowLeft className="size-4" /> App
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 lg:px-6">{children}</main>
    </div>
  )
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

function Dashboard() {
  const data = useQuery(api.superAdmin.overview)
  const [q, setQ] = React.useState("")

  if (data === undefined) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    )
  }

  const { stats, orgs } = data
  const filtered = q.trim()
    ? orgs.filter(
        (o) =>
          o.name.toLowerCase().includes(q.toLowerCase()) ||
          (o.slug ?? "").toLowerCase().includes(q.toLowerCase()),
      )
    : orgs

  return (
    <div className="flex flex-col gap-8">
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          icon={<IconBuilding className="size-5" />}
          label="Organizations"
          value={stats.totalOrgs.toLocaleString()}
        />
        <StatCard
          icon={<IconUsers className="size-5" />}
          label="Users"
          value={stats.totalUsers.toLocaleString()}
        />
        <StatCard
          icon={<IconUserCheck className="size-5" />}
          label="Active employees"
          value={stats.activeEmployees.toLocaleString()}
        />
        <StatCard
          icon={<IconRosetteDiscountCheck className="size-5" />}
          label="Active subscriptions"
          value={stats.activeSubscriptions.toLocaleString()}
        />
        <StatCard
          icon={<IconRosetteDiscountCheck className="size-5" />}
          label="Paying orgs"
          value={stats.payingOrgs.toLocaleString()}
        />
        <StatCard
          icon={<IconCoin className="size-5" />}
          label="Est. MRR"
          value={formatSgd(stats.estMrrCents)}
          accent
        />
      </div>

      {/* Orgs table */}
      <div className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">Organizations</h2>
            <p className="text-muted-foreground text-sm">
              {filtered.length} of {orgs.length} shown · newest first
            </p>
          </div>
          <div className="relative sm:w-64">
            <IconSearch className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search organizations…"
              className="pl-9"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Seats</TableHead>
                <TableHead className="text-right">Employees</TableHead>
                <TableHead className="text-right">Members</TableHead>
                <TableHead className="text-right">MRR</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Users</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((o) => (
                <TableRow key={o.orgId}>
                  <TableCell>
                    <div className="font-medium">{o.name}</div>
                    <div className="text-muted-foreground text-xs">
                      {o.slug ? `/${o.slug}` : o.country}
                    </div>
                  </TableCell>
                  <TableCell>
                    {o.planName ? (
                      <Badge variant="secondary">{o.planName}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <SubStatus status={o.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {o.seats ?? "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      o.seats != null &&
                        o.activeEmployees > o.seats &&
                        "font-medium text-amber-600 dark:text-amber-400",
                    )}
                  >
                    {o.activeEmployees}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {o.memberCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {o.priceCents != null ? formatSgd(o.priceCents) : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                    {formatDate(o.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/super-admin/orgs/${o.orgId}`}>
                        View
                        <IconExternalLink className="size-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-muted-foreground py-10 text-center text-sm"
                  >
                    No organizations match &ldquo;{q}&rdquo;.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <PlatformDeployments />

      <Leads />
    </div>
  )
}

// ─── Convex fleet (projects & deployments via Management API) ─────────────────

type PlatformProject = {
  id: string
  name: string
  slug: string
  teamSlug: string
  createTime: number
  prodDeploymentName: string | null
  prodDeploymentUrl: string | null
  prodLastDeployTime: number | null
  dashboardUrl: string | null
  isCurrent: boolean
}

function PlatformDeployments() {
  const load = useAction(api.superAdmin.platformProjects)
  const [state, setState] = React.useState<
    | { status: "loading" }
    | {
        status: "ready"
        configured: boolean
        error: string | null
        projects: PlatformProject[]
      }
  >({ status: "loading" })
  const [refreshing, setRefreshing] = React.useState(false)

  const refresh = React.useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await load({})
      setState({
        status: "ready",
        configured: res.configured,
        error: res.error,
        projects: res.projects,
      })
    } catch {
      setState({
        status: "ready",
        configured: true,
        error: "Couldn't reach the Convex Management API.",
        projects: [],
      })
    } finally {
      setRefreshing(false)
    }
  }, [load])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-xl">
            <IconServer className="size-5" />
          </div>
          <div>
            <h2 className="font-semibold">Convex fleet</h2>
            <p className="text-muted-foreground text-sm">
              {state.status === "ready" && state.configured
                ? `${state.projects.length} project${
                    state.projects.length === 1 ? "" : "s"
                  } · shared + dedicated Enterprise deployments`
                : "Projects & deployments across the team"}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refresh()}
          disabled={refreshing}
        >
          <IconRefresh
            className={cn("size-4", refreshing && "animate-spin")}
          />
          Refresh
        </Button>
      </div>

      {state.status === "loading" ? (
        <div className="p-4">
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : !state.configured ? (
        <div className="text-muted-foreground p-6 text-sm">
          <p className="text-foreground font-medium">
            Fleet view not configured
          </p>
          <p className="mt-1.5">
            To list every Convex project (including each Enterprise customer&apos;s
            dedicated deployment), set two env vars on this deployment with a{" "}
            <span className="text-foreground font-medium">Team Access Token</span>{" "}
            from Convex → Team Settings → Access Tokens:
          </p>
          <code className="text-foreground mt-3 block rounded-lg border border-border bg-muted/40 p-3 text-xs">
            CONVEX_MANAGEMENT_TOKEN=ey…
            <br />
            CONVEX_TEAM_ID=41
          </code>
        </div>
      ) : state.error ? (
        <div className="text-destructive p-6 text-sm">
          <p className="font-medium">Couldn&apos;t load the fleet</p>
          <p className="text-muted-foreground mt-1 break-all">{state.error}</p>
        </div>
      ) : state.projects.length === 0 ? (
        <div className="text-muted-foreground p-10 text-center text-sm">
          No Convex projects returned for this team.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Production deployment</TableHead>
                <TableHead>Last deploy</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Links</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.projects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{p.name}</span>
                      {p.isCurrent && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-600 uppercase dark:text-emerald-400">
                          <IconCircleCheck className="size-3" /> This deployment
                        </span>
                      )}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      /{p.slug}
                    </div>
                  </TableCell>
                  <TableCell>
                    {p.prodDeploymentName ? (
                      <div>
                        <div className="font-mono text-xs">
                          {p.prodDeploymentName}
                        </div>
                        {p.prodDeploymentUrl && (
                          <div className="text-muted-foreground/80 font-mono text-[11px] break-all">
                            {p.prodDeploymentUrl.replace(/^https?:\/\//, "")}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">
                        No prod deployment
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                    {p.prodLastDeployTime
                      ? formatDate(p.prodLastDeployTime)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                    {formatDate(p.createTime)}
                  </TableCell>
                  <TableCell className="text-right">
                    {p.dashboardUrl && (
                      <Button variant="ghost" size="sm" asChild>
                        <a
                          href={p.dashboardUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Dashboard
                          <IconExternalLink className="size-4" />
                        </a>
                      </Button>
                    )}
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

// ─── Leads (landing contact form → inbox) ────────────────────────────────────

function Leads() {
  const leads = useQuery(api.superAdmin.leads)
  const setStatus = useMutation(api.superAdmin.setLeadStatus)
  const [filter, setFilter] = React.useState<"open" | "all">("open")

  if (leads === undefined) {
    return <Skeleton className="h-64 rounded-2xl" />
  }

  const newCount = leads.filter((l) => l.status === "new").length
  const rows =
    filter === "open" ? leads.filter((l) => l.status !== "archived") : leads

  async function move(
    leadId: Id<"contactLeads">,
    status: "new" | "contacted" | "archived",
  ) {
    try {
      await setStatus({ leadId, status })
    } catch {
      toast.error("Couldn't update the lead. Try again.")
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <div className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-xl">
            <IconInbox className="size-5" />
          </div>
          <div>
            <h2 className="font-semibold">Contact leads</h2>
            <p className="text-muted-foreground text-sm">
              {newCount > 0 ? `${newCount} new · ` : ""}
              {leads.length} total · from the landing form
            </p>
          </div>
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          {(["open", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium capitalize transition-colors",
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-muted-foreground p-10 text-center text-sm">
          {filter === "open"
            ? "No open leads — you're all caught up."
            : "No leads yet. Enquiries from the landing page land here."}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((l) => (
            <LeadRow key={l.id} lead={l} onMove={move} />
          ))}
        </ul>
      )}
    </div>
  )
}

function LeadRow({
  lead,
  onMove,
}: {
  lead: {
    id: Id<"contactLeads">
    name: string
    email: string
    company: string | null
    product: string | null
    message: string
    status: string
    createdAt: number
  }
  onMove: (
    id: Id<"contactLeads">,
    status: "new" | "contacted" | "archived",
  ) => void
}) {
  const archived = lead.status === "archived"
  return (
    <li className={cn("p-4 sm:px-5", archived && "opacity-60")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">{lead.name}</span>
            <LeadStatus status={lead.status} />
            {lead.company && (
              <span className="text-muted-foreground text-sm">
                · {lead.company}
              </span>
            )}
            {lead.product && (
              <Badge variant="secondary" className="text-[11px]">
                {lead.product}
              </Badge>
            )}
          </div>
          <a
            href={`mailto:${lead.email}`}
            className="text-primary text-sm hover:underline"
          >
            {lead.email}
          </a>
          <p className="text-muted-foreground mt-1.5 text-sm whitespace-pre-wrap">
            {lead.message}
          </p>
          <p className="text-muted-foreground/70 mt-1.5 text-xs">
            {formatDate(lead.createdAt)}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="outline" size="sm" asChild>
            <a href={`mailto:${lead.email}`}>
              <IconMail className="size-4" /> Reply
            </a>
          </Button>
          {lead.status === "new" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onMove(lead.id, "contacted")}
            >
              <IconCheck className="size-4" /> Contacted
            </Button>
          )}
          {!archived ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Archive lead"
              onClick={() => onMove(lead.id, "archived")}
            >
              <IconArchive className="size-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onMove(lead.id, "new")}
            >
              Restore
            </Button>
          )}
        </div>
      </div>
    </li>
  )
}

function LeadStatus({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    new: {
      label: "New",
      cls: "bg-primary/10 text-primary border-primary/20",
    },
    contacted: {
      label: "Contacted",
      cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    },
    archived: {
      label: "Archived",
      cls: "bg-muted text-muted-foreground border-border",
    },
  }
  const s = map[status] ?? map.new
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
        s.cls,
      )}
    >
      {s.label}
    </span>
  )
}

// ─── Bits ────────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div
        className={cn(
          "flex size-9 items-center justify-center rounded-xl",
          accent
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground",
        )}
      >
        {icon}
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight tabular-nums">
        {value}
      </div>
      <div className="text-muted-foreground text-xs font-medium">{label}</div>
    </div>
  )
}

function SubStatus({ status }: { status: string | null }) {
  if (!status)
    return <span className="text-muted-foreground text-sm">No plan</span>
  const cls: Record<string, string> = {
    active: "text-emerald-600 dark:text-emerald-400",
    trialing: "text-primary",
    past_due: "text-destructive",
    canceled: "text-muted-foreground",
  }
  return (
    <span
      className={cn(
        "text-sm font-medium capitalize",
        cls[status] ?? "text-muted-foreground",
      )}
    >
      {status.replace("_", " ")}
    </span>
  )
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}
