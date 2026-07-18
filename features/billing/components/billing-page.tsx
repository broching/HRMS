"use client"

import * as React from "react"
import { useQuery, useAction } from "convex/react"
import { useSearchParams, useRouter } from "next/navigation"
import { api } from "@/convex/_generated/api"
import { ConvexError } from "convex/values"
import { toast } from "sonner"
import {
  IconCreditCard,
  IconUsers,
  IconCalendarEvent,
  IconExternalLink,
  IconAlertTriangle,
  IconPuzzle,
  IconBuildingSkyscraper,
  IconShieldCheck,
  IconMail,
} from "@tabler/icons-react"
import {
  formatSgd,
  CORE_TIERS,
  ENTERPRISE,
  type OptionalModuleKey,
} from "@/convex/lib/plans"
import { MODULE_META } from "@/convex/lib/modules"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { PricingPlans } from "./pricing-plans"

export function BillingPage() {
  const summary = useQuery(api.billing.getBillingSummary)
  const openPortal = useAction(api.stripe.createBillingPortalSession)
  const params = useSearchParams()
  const router = useRouter()
  const [portalPending, setPortalPending] = React.useState(false)
  const [showPlans, setShowPlans] = React.useState(false)

  // Surface the Checkout return, then clean the URL so a refresh doesn't re-toast.
  React.useEffect(() => {
    const outcome = params.get("checkout")
    if (outcome === "success") {
      toast.success("Subscription active. Welcome aboard!")
    } else if (outcome === "cancel") {
      toast.info("Checkout cancelled — no changes were made.")
    }
    if (outcome) router.replace("/hr-lounge/billing")
  }, [params, router])

  async function manageBilling() {
    if (portalPending) return
    setPortalPending(true)
    try {
      const { url } = await openPortal({})
      window.location.href = url
    } catch (err) {
      setPortalPending(false)
      const message =
        err instanceof ConvexError
          ? (err.data as { message?: string })?.message
          : undefined
      toast.error(message ?? "Couldn't open the billing portal.")
    }
  }

  if (summary === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }

  // Dedicated Enterprise deployment: billing is managed manually (custom quote),
  // so replace the whole self-serve builder with the managed-support panel.
  if (summary.dedicated) {
    return <DedicatedDeploymentPanel orgName={summary.orgName} />
  }

  const active = summary.hasSubscription

  return (
    <div className="flex flex-col gap-8">
      {!summary.enforced && (
        <div className="border-border bg-muted/40 text-muted-foreground flex items-start gap-3 rounded-xl border p-4 text-sm">
          <IconAlertTriangle className="mt-0.5 size-5 shrink-0" />
          <p>
            Billing enforcement is currently <strong>off</strong> — the app is
            unlocked for everyone regardless of subscription. Set{" "}
            <code className="bg-background rounded px-1 py-0.5 text-xs">
              BILLING_ENFORCED=true
            </code>{" "}
            in your Convex environment to turn on the paywall.
          </p>
        </div>
      )}

      {active ? (
        <CurrentSubscription
          summary={summary}
          onManage={manageBilling}
          portalPending={portalPending}
          onChangePlan={() => setShowPlans((s) => !s)}
          showPlans={showPlans}
        />
      ) : (
        <NoSubscription
          orgName={summary.orgName}
          activeEmployees={summary.activeEmployees}
        />
      )}

      {(!active || showPlans) && (
        <PricingPlans
          canManage
          currentModules={summary.modules}
          hasSubscription={active}
          initialSeats={summary.seats ?? summary.activeEmployees}
        />
      )}
    </div>
  )
}

function DedicatedDeploymentPanel({ orgName }: { orgName: string }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="bg-primary/10 text-primary flex size-12 shrink-0 items-center justify-center rounded-2xl">
            <IconBuildingSkyscraper className="size-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">{orgName}</h2>
              <span className="bg-primary/10 text-primary border-primary/20 rounded-full border px-2 py-0.5 text-[11px] font-semibold">
                Enterprise · Dedicated deployment
              </span>
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              {orgName} runs on its own dedicated, single-tenant deployment —
              your own database, keys and domain. Billing is handled by your
              account manager under your Enterprise agreement, so there&apos;s
              nothing to configure here. Every module is included.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Stat
            icon={<IconShieldCheck className="size-4" />}
            label="Deployment"
            value="Dedicated"
          />
          <Stat
            icon={<IconPuzzle className="size-4" />}
            label="Modules"
            value="All included"
          />
          <Stat
            icon={<IconCreditCard className="size-4" />}
            label="Billing"
            value="Managed"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="text-muted-foreground mb-3 text-xs font-semibold tracking-[0.14em] uppercase">
          What&apos;s included
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {ENTERPRISE.features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm">
              <IconShieldCheck className="text-primary mt-0.5 size-4 shrink-0" />
              <span>{f}</span>
            </li>
          ))}
        </ul>

        <div className="border-border mt-6 flex flex-col items-start gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted-foreground text-sm">
            Need to change your plan, add seats or ask about the platform?
            Contact your dedicated account manager.
          </p>
          <Button asChild variant="outline">
            <a href="mailto:enterprise@leadmighty.com">
              <IconMail className="size-4" />
              Contact your account manager
            </a>
          </Button>
        </div>
      </div>
    </div>
  )
}

function NoSubscription({
  orgName,
  activeEmployees,
}: {
  orgName: string
  activeEmployees: number
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="bg-primary/10 text-primary flex size-12 shrink-0 items-center justify-center rounded-2xl">
          <IconCreditCard className="size-6" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">{orgName}</h2>
            <span className="bg-muted text-muted-foreground rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold">
              No active plan
            </span>
          </div>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Build your plan below — the Core platform plus the modules you need.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat
          icon={<IconUsers className="size-4" />}
          label="Active employees"
          value={`${activeEmployees}`}
        />
        <Stat
          icon={<IconCreditCard className="size-4" />}
          label="Core platform"
          value={`From ${formatSgd(CORE_TIERS[0].cents)}/mo`}
        />
        <Stat
          icon={<IconPuzzle className="size-4" />}
          label="Modules"
          value="Pick à la carte"
        />
      </div>
    </div>
  )
}

function CurrentSubscription({
  summary,
  onManage,
  portalPending,
  onChangePlan,
  showPlans,
}: {
  summary: NonNullable<ReturnType<typeof useBillingSummary>>
  onManage: () => void
  portalPending: boolean
  onChangePlan: () => void
  showPlans: boolean
}) {
  const seats = summary.seats ?? 0
  const overSeats = summary.activeEmployees > seats
  const modules = (summary.modules ?? []).filter(isOptional)
  const title = summary.planName ?? "Your plan"
  const renews = summary.currentPeriodEnd
    ? new Date(summary.currentPeriodEnd).toLocaleDateString("en-SG", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="bg-primary/10 text-primary flex size-12 shrink-0 items-center justify-center rounded-2xl">
            <IconCreditCard className="size-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">{title}</h2>
              <StatusBadge status={summary.status} />
            </div>
            <p className="text-muted-foreground mt-0.5 text-sm">
              {summary.priceCents != null ? (
                <>
                  <span className="text-foreground font-semibold">
                    {formatSgd(summary.priceCents)}
                  </span>{" "}
                  / month
                </>
              ) : null}
            </p>
            {summary.cancelAtPeriodEnd && renews && (
              <p className="text-destructive mt-1 text-xs font-medium">
                Cancels on {renews}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onChangePlan}>
            {showPlans ? "Hide plans" : "Change plan"}
          </Button>
          <Button onClick={onManage} disabled={portalPending}>
            {portalPending ? "Opening…" : "Manage billing"}
            <IconExternalLink className="size-4" />
          </Button>
        </div>
      </div>

      {modules.length > 0 && (
        <div className="mt-5">
          <div className="text-muted-foreground mb-2 text-xs font-medium">
            Enabled modules
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">Core platform</Badge>
            {modules.map((m) => (
              <Badge key={m} variant="secondary">
                {MODULE_META[m].name}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat
          icon={<IconUsers className="size-4" />}
          label="Seats purchased"
          value={`${seats}`}
        />
        <Stat
          icon={<IconUsers className="size-4" />}
          label="Active employees"
          value={`${summary.activeEmployees}`}
          warn={overSeats}
        />
        <Stat
          icon={<IconCalendarEvent className="size-4" />}
          label={summary.cancelAtPeriodEnd ? "Access until" : "Renews on"}
          value={renews ?? "—"}
        />
      </div>

      {overSeats && (
        <div className="border-amber-500/30 bg-amber-500/10 mt-4 flex items-start gap-3 rounded-xl border p-3 text-sm text-amber-700 dark:text-amber-400">
          <IconAlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            You have {summary.activeEmployees} active employees but only {seats}{" "}
            seats. Use <strong>Change plan</strong> to add seats and stay covered.
          </p>
        </div>
      )}
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
  warn,
}: {
  icon: React.ReactNode
  label: string
  value: string
  warn?: boolean
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          "mt-1 text-lg font-semibold tabular-nums",
          warn && "text-amber-600 dark:text-amber-400",
        )}
      >
        {value}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: {
      label: "Active",
      cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    },
    trialing: {
      label: "Trialing",
      cls: "bg-primary/10 text-primary border-primary/20",
    },
    past_due: {
      label: "Past due",
      cls: "bg-destructive/10 text-destructive border-destructive/20",
    },
    canceled: {
      label: "Canceled",
      cls: "bg-muted text-muted-foreground border-border",
    },
  }
  const s = (status && map[status]) || {
    label: status ?? "—",
    cls: "bg-muted text-muted-foreground border-border",
  }
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize",
        s.cls,
      )}
    >
      {s.label}
    </span>
  )
}

function isOptional(k: string): k is OptionalModuleKey {
  return k in MODULE_META && k !== "core"
}

// Helper alias so CurrentSubscription can type its `summary` prop against the
// query's return shape without repeating the object literal.
function useBillingSummary() {
  return useQuery(api.billing.getBillingSummary)
}
