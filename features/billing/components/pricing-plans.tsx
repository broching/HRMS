"use client"

import * as React from "react"
import Link from "next/link"
import { useAction } from "convex/react"
import { api } from "@/convex/_generated/api"
import { ConvexError } from "convex/values"
import { toast } from "sonner"
import {
  IconCheck,
  IconMinus,
  IconPlus,
  IconSparkles,
  IconArrowRight,
} from "@tabler/icons-react"
import {
  PLANS,
  PLAN_ORDER,
  PLAN_FEATURES,
  computeMonthlyCents,
  extraSeats,
  recommendedPlan,
  formatSgd,
  isPaidPlanKey,
  type PlanKey,
} from "@/convex/lib/plans"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const MIN_SEATS = 1
const MAX_SEATS = 300
const PRESETS = [5, 25, 75, 150]

type Props = {
  /** Seed the headcount slider (e.g. the org's current active employees). */
  initialSeats?: number
  /** The org's active plan key, if any — marks its card as current. */
  currentPlan?: string | null
  /** Only admins may start checkout; others see disabled CTAs. */
  canManage: boolean
  className?: string
}

export function PricingPlans({
  initialSeats,
  currentPlan,
  canManage,
  className,
}: Props) {
  const [seats, setSeats] = React.useState<number>(() =>
    clamp(initialSeats && initialSeats > 0 ? initialSeats : 10),
  )
  const [pending, setPending] = React.useState<PlanKey | null>(null)
  const createCheckout = useAction(api.stripe.createCheckoutSession)

  const recommended = recommendedPlan(seats)

  async function subscribe(plan: PlanKey) {
    if (!isPaidPlanKey(plan) || pending) return
    setPending(plan)
    try {
      const { url } = await createCheckout({ plan, seats })
      window.location.href = url
    } catch (err) {
      setPending(null)
      const message =
        err instanceof ConvexError
          ? (err.data as { message?: string })?.message
          : undefined
      toast.error(message ?? "Couldn't start checkout. Please try again.")
    }
  }

  return (
    <div className={cn("flex flex-col gap-8", className)}>
      <HeadcountControl seats={seats} onChange={(n) => setSeats(clamp(n))} />

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {PLAN_ORDER.map((key) => (
          <PlanCard
            key={key}
            planKey={key}
            seats={seats}
            recommended={recommended === key}
            isCurrent={currentPlan === key}
            canManage={canManage}
            pending={pending === key}
            anyPending={pending !== null}
            onSubscribe={() => subscribe(key)}
          />
        ))}
      </div>

      <p className="text-muted-foreground text-center text-xs">
        Billed monthly in SGD · Cancel anytime · Additional employees are billed
        at your plan&apos;s per-employee rate. Prices shown update live with your
        headcount.
      </p>
    </div>
  )
}

// ─── Headcount control (the signature interaction) ───────────────────────────

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
            Drag to see exactly what each plan costs for your headcount.
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

// ─── Plan card ───────────────────────────────────────────────────────────────

function PlanCard({
  planKey,
  seats,
  recommended,
  isCurrent,
  canManage,
  pending,
  anyPending,
  onSubscribe,
}: {
  planKey: PlanKey
  seats: number
  recommended: boolean
  isCurrent: boolean
  canManage: boolean
  pending: boolean
  anyPending: boolean
  onSubscribe: () => void
}) {
  const plan = PLANS[planKey]
  const isEnterprise = planKey === "enterprise"
  const total = computeMonthlyCents(planKey, seats)
  const over = extraSeats(planKey, seats)
  const popular = !!plan.popular

  const card = (
    <div
      className={cn(
        "relative flex h-full flex-col rounded-2xl border bg-card p-6",
        popular
          ? "border-transparent shadow-lg"
          : "border-border shadow-sm",
      )}
    >
      {/* Corner status ribbons */}
      {popular && (
        <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-sky-500 to-indigo-600 px-3 py-1 text-[11px] font-semibold text-white shadow-md">
          <IconSparkles className="size-3.5" /> Most popular
        </span>
      )}
      {recommended && (
        <span className="border-primary/30 bg-primary/10 text-primary absolute -top-3 right-6 rounded-full border px-3 py-1 text-[11px] font-semibold">
          Best for {seats}
        </span>
      )}

      <div className="flex flex-col gap-1">
        <h3 className="text-xl font-semibold">{plan.name}</h3>
        <p className="text-muted-foreground min-h-[2.5rem] text-sm">
          {plan.tagline}
        </p>
      </div>

      {/* Price */}
      <div className="mt-5">
        {isEnterprise || total === null ? (
          <div className="text-3xl font-extrabold tracking-tight">
            Custom
          </div>
        ) : (
          <div className="flex items-baseline gap-1">
            <span
              key={total}
              className="text-primary text-4xl font-extrabold tracking-tight tabular-nums"
            >
              {formatSgd(total)}
            </span>
            <span className="text-muted-foreground text-sm font-medium">
              /month
            </span>
          </div>
        )}
        <p className="text-muted-foreground mt-1.5 min-h-[2rem] text-xs">
          {isEnterprise ? (
            <>For 150+ employees. Tailored per-employee pricing.</>
          ) : over > 0 ? (
            <>
              {formatSgd(plan.baseCents!)} base + {over} extra{" "}
              {over === 1 ? "employee" : "employees"} ×{" "}
              {formatSgd(plan.extraSeatCents!, true)}
            </>
          ) : (
            <>Up to {plan.includedSeats} employees included</>
          )}
        </p>
      </div>

      {/* CTA */}
      <div className="mt-5">
        {isEnterprise ? (
          <Button asChild variant="outline" className="w-full">
            <Link href="/leadmightyhr#contact">
              Contact sales <IconArrowRight className="size-4" />
            </Link>
          </Button>
        ) : isCurrent ? (
          <Button variant="secondary" className="w-full" disabled>
            Current plan
          </Button>
        ) : (
          <Button
            className={cn(
              "w-full",
              popular &&
                "bg-gradient-to-r from-sky-500 to-indigo-600 text-white hover:opacity-90",
            )}
            variant={popular ? "default" : "outline"}
            disabled={!canManage || anyPending}
            onClick={onSubscribe}
          >
            {pending ? "Redirecting…" : `Choose ${plan.name}`}
          </Button>
        )}
        {!canManage && !isEnterprise && (
          <p className="text-muted-foreground mt-2 text-center text-[11px]">
            Only an admin can change the subscription.
          </p>
        )}
      </div>

      {/* Features */}
      <ul className="mt-6 space-y-2.5 border-t border-border pt-5">
        {PLAN_FEATURES.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm">
            <IconCheck className="text-primary mt-0.5 size-4 shrink-0" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  )

  // Popular plan gets a gradient border frame around the card.
  if (popular) {
    return (
      <div className="rounded-2xl bg-gradient-to-b from-sky-500 to-indigo-600 p-[1.5px]">
        {card}
      </div>
    )
  }
  return card
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return MIN_SEATS
  return Math.min(MAX_SEATS, Math.max(MIN_SEATS, Math.round(n)))
}
