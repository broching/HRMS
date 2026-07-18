"use client"

import * as React from "react"
import Link from "next/link"
import { useAction } from "convex/react"
import { api } from "@/convex/_generated/api"
import { ConvexError } from "convex/values"
import { toast } from "sonner"
import { IconMinus, IconPlus, IconArrowRight, IconCheck } from "@tabler/icons-react"
import {
  CORE_MAX_SEATS,
  MODULE_PRICING,
  ENTERPRISE,
  computeBillingCents,
  computeCoreCents,
  formatSgd,
  type OptionalModuleKey,
} from "@/convex/lib/plans"
import { IconBuildingSkyscraper } from "@tabler/icons-react"
import { OPTIONAL_MODULES, MODULE_META } from "@/convex/lib/modules"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"

const MIN_SEATS = 1
const MAX_SEATS = CORE_MAX_SEATS
const PRESETS = [5, 25, 50, 100]

type Props = {
  /** Seed the headcount slider (e.g. the org's current active employees). */
  initialSeats?: number
  /** The org's currently-paid modules — pre-selects them. */
  currentModules?: string[]
  /** Whether the org already has a subscription (changes the CTA copy). */
  hasSubscription?: boolean
  /** Only admins may start checkout; others see a disabled CTA. */
  canManage: boolean
  className?: string
}

export function PricingPlans({
  initialSeats,
  currentModules,
  hasSubscription,
  canManage,
  className,
}: Props) {
  const [seats, setSeats] = React.useState<number>(() =>
    clamp(initialSeats && initialSeats > 0 ? initialSeats : 10),
  )
  const [selected, setSelected] = React.useState<Set<OptionalModuleKey>>(() => {
    // Pre-select the org's current modules; for a fresh org, show the full
    // suite selected so the price is transparent and easy to trim.
    const seed =
      currentModules && currentModules.length > 0
        ? currentModules.filter(isOptional)
        : (OPTIONAL_MODULES as OptionalModuleKey[])
    return new Set(seed)
  })
  const [pending, setPending] = React.useState(false)
  const createCheckout = useAction(api.stripe.createCheckoutSession)

  const modules = React.useMemo(
    () => (OPTIONAL_MODULES as OptionalModuleKey[]).filter((m) => selected.has(m)),
    [selected],
  )
  const cost = computeBillingCents(seats, modules)

  function toggle(key: OptionalModuleKey) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function subscribe() {
    if (pending || !canManage) return
    setPending(true)
    try {
      const { url } = await createCheckout({ seats, modules })
      window.location.href = url
    } catch (err) {
      setPending(false)
      const message =
        err instanceof ConvexError
          ? (err.data as { message?: string })?.message
          : undefined
      toast.error(message ?? "Couldn't start checkout. Please try again.")
    }
  }

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <HeadcountControl seats={seats} onChange={(n) => setSeats(clamp(n))} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        {/* Module picker */}
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h3 className="font-semibold">Choose your modules</h3>
            <span className="text-muted-foreground text-sm">
              {modules.length} of {OPTIONAL_MODULES.length} selected
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(OPTIONAL_MODULES as OptionalModuleKey[]).map((key) => (
              <ModuleRow
                key={key}
                mkey={key}
                on={selected.has(key)}
                onToggle={() => toggle(key)}
              />
            ))}
          </div>
        </div>

        {/* Order summary */}
        <OrderSummary
          seats={seats}
          modules={modules}
          cost={cost}
          canManage={canManage}
          pending={pending}
          hasSubscription={hasSubscription}
          onSubscribe={subscribe}
        />
      </div>

      <EnterpriseCard atCap={seats >= CORE_MAX_SEATS} />

      <p className="text-muted-foreground text-center text-xs">
        Billed monthly in SGD · Cancel anytime · The Core platform is priced by
        team size; each module is a flat monthly add-on. Prices update live.
      </p>
    </div>
  )
}

function EnterpriseCard({ atCap }: { atCap: boolean }) {
  return (
    <div className="border-primary/30 from-primary/5 rounded-2xl border bg-gradient-to-br to-transparent p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-xl">
              <IconBuildingSkyscraper className="size-5" />
            </div>
            <h3 className="text-lg font-semibold">{ENTERPRISE.name}</h3>
          </div>
          <p className="text-muted-foreground mt-2 max-w-xl text-sm">
            {atCap ? (
              <>
                More than {CORE_MAX_SEATS} employees or need a{" "}
                <strong>dedicated deployment</strong>? {ENTERPRISE.tagline}
              </>
            ) : (
              ENTERPRISE.tagline
            )}{" "}
            Your own database and keys, every module included, priority support —
            billed on a custom quote.
          </p>
          <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
            {ENTERPRISE.features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <IconCheck className="text-primary mt-0.5 size-4 shrink-0" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <Button asChild variant="outline">
            <Link href="/leadmightyhr#contact">
              Contact sales <IconArrowRight className="size-4" />
            </Link>
          </Button>
          <span className="text-muted-foreground text-[11px]">
            Custom quote · dedicated support
          </span>
        </div>
      </div>
    </div>
  )
}

function ModuleRow({
  mkey,
  on,
  onToggle,
}: {
  mkey: OptionalModuleKey
  on: boolean
  onToggle: () => void
}) {
  const meta = MODULE_META[mkey]
  const price = MODULE_PRICING[mkey].monthlyCents
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex items-start justify-between gap-3 rounded-xl border p-4 text-left transition-colors",
        on
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-card hover:bg-accent/40",
      )}
    >
      <div className="min-w-0">
        <div className="font-medium">{meta.name}</div>
        <p className="text-muted-foreground mt-0.5 text-xs leading-relaxed">
          {meta.description}
        </p>
        <div className="text-foreground mt-2 text-sm font-semibold tabular-nums">
          {formatSgd(price)}
          <span className="text-muted-foreground font-normal">/mo</span>
        </div>
      </div>
      <Switch checked={on} className="pointer-events-none mt-0.5 shrink-0" />
    </button>
  )
}

function OrderSummary({
  seats,
  modules,
  cost,
  canManage,
  pending,
  hasSubscription,
  onSubscribe,
}: {
  seats: number
  modules: OptionalModuleKey[]
  cost: { baseCents: number; moduleCents: number; totalCents: number }
  canManage: boolean
  pending: boolean
  hasSubscription?: boolean
  onSubscribe: () => void
}) {
  return (
    <div className="h-fit rounded-2xl border border-border bg-card p-5 shadow-sm lg:sticky lg:top-20">
      <h3 className="font-semibold">Your plan</h3>

      <div className="mt-4 flex flex-col gap-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">
            Core platform · {seats} {seats === 1 ? "employee" : "employees"}
          </span>
          <span className="font-medium tabular-nums">
            {formatSgd(cost.baseCents)}
          </span>
        </div>
        {modules.map((m) => (
          <div key={m} className="flex items-center justify-between">
            <span className="text-muted-foreground">{MODULE_META[m].name}</span>
            <span className="font-medium tabular-nums">
              {formatSgd(MODULE_PRICING[m].monthlyCents)}
            </span>
          </div>
        ))}
        {modules.length === 0 && (
          <p className="text-muted-foreground text-xs">
            No add-ons selected — just the Core platform.
          </p>
        )}
      </div>

      <div className="mt-4 flex items-baseline justify-between border-t border-border pt-4">
        <span className="text-sm font-medium">Total</span>
        <span className="text-primary text-2xl font-extrabold tracking-tight tabular-nums">
          {formatSgd(cost.totalCents)}
          <span className="text-muted-foreground ml-1 text-sm font-medium">
            /mo
          </span>
        </span>
      </div>

      <Button
        className="mt-4 w-full"
        disabled={!canManage || pending}
        onClick={onSubscribe}
      >
        {pending
          ? "Redirecting…"
          : hasSubscription
            ? "Update subscription"
            : "Subscribe"}
        {!pending && <IconArrowRight className="size-4" />}
      </Button>
      {!canManage ? (
        <p className="text-muted-foreground mt-2 text-center text-[11px]">
          Only an admin can change the subscription.
        </p>
      ) : (
        <p className="text-muted-foreground mt-3 flex items-start gap-1.5 text-[11px]">
          <IconCheck className="text-primary mt-0.5 size-3.5 shrink-0" />
          Change modules or headcount anytime — you&apos;re only billed for
          what&apos;s enabled.
        </p>
      )}
      <p className="text-muted-foreground mt-3 text-center text-[11px]">
        Need something bespoke?{" "}
        <Link href="/leadmightyhr#contact" className="text-primary underline">
          Talk to us
        </Link>
      </p>
    </div>
  )
}

// ─── Headcount control (drives the per-seat Core fee) ────────────────────────

function HeadcountControl({
  seats,
  onChange,
}: {
  seats: number
  onChange: (n: number) => void
}) {
  const pct = ((seats - MIN_SEATS) / (MAX_SEATS - MIN_SEATS)) * 100
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
            Your team size
          </div>
          <h3 className="mt-1 text-lg font-semibold">
            How many employees will you manage?
          </h3>
          <p className="text-muted-foreground mt-0.5 text-sm">
            The Core platform scales with your team —{" "}
            <span className="text-foreground font-semibold">
              {formatSgd(computeCoreCents(seats))}
            </span>
            /month for {seats} {seats === 1 ? "employee" : "employees"}.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <Stepper
            aria-label="Fewer employees"
            onClick={() => onChange(seats - 1)}
            disabled={seats <= MIN_SEATS}
            icon={<IconMinus className="size-4" />}
          />
          <div className="min-w-[5.5rem] text-center">
            <span className="text-4xl font-extrabold tracking-tight tabular-nums">
              {seats}
            </span>
            <span className="text-muted-foreground ml-1 text-sm font-medium">
              {seats === 1 ? "employee" : "employees"}
            </span>
          </div>
          <Stepper
            aria-label="More employees"
            onClick={() => onChange(seats + 1)}
            disabled={seats >= MAX_SEATS}
            icon={<IconPlus className="size-4" />}
          />
        </div>
      </div>

      <div className="mt-5">
        <input
          type="range"
          min={MIN_SEATS}
          max={MAX_SEATS}
          value={seats}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Number of employees"
          className="h-2 w-full cursor-pointer appearance-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-primary"
          style={{
            background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${pct}%, var(--secondary) ${pct}%, var(--secondary) 100%)`,
          }}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground mr-1 text-xs">Quick pick:</span>
          {PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                seats === n
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function Stepper({
  onClick,
  disabled,
  icon,
  ...rest
}: {
  onClick: () => void
  disabled?: boolean
  icon: React.ReactNode
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-foreground flex size-9 items-center justify-center rounded-full border border-border bg-background transition-colors hover:bg-accent disabled:opacity-40 disabled:hover:bg-background"
      {...rest}
    >
      {icon}
    </button>
  )
}

function isOptional(k: string): k is OptionalModuleKey {
  return (OPTIONAL_MODULES as string[]).includes(k)
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return MIN_SEATS
  return Math.min(MAX_SEATS, Math.max(MIN_SEATS, Math.round(n)))
}
