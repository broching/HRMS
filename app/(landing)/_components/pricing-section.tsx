"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Minus, Plus, Check } from "lucide-react";
import { Authenticated, Unauthenticated } from "convex/react";
import { SignUpButton } from "@clerk/nextjs";
import { SectionHeading } from "./section-heading";
import { Reveal } from "./reveal";
import {
  PLANS,
  PLAN_ORDER,
  PLAN_FEATURES,
  computeMonthlyCents,
  extraSeats,
  recommendedPlan,
  formatSgd,
  type PlanKey,
} from "@/convex/lib/plans";

const MIN = 1;
const MAX = 300;
const PRESETS = [5, 25, 75, 150];
// The tier boundaries, annotated on the ruler so the control itself explains
// the pricing model — where each plan's included headcount ends.
const TICKS: { seat: number; label: string }[] = [
  { seat: 10, label: "Starter" },
  { seat: 50, label: "Growth" },
  { seat: 150, label: "Business" },
];

const pctOf = (s: number) => ((s - MIN) / (MAX - MIN)) * 100;
const clamp = (n: number) =>
  Number.isNaN(n) ? MIN : Math.min(MAX, Math.max(MIN, Math.round(n)));

export function PricingSection() {
  const [seats, setSeats] = React.useState(12);
  const recommended = recommendedPlan(seats);
  const fillPct = pctOf(seats);

  return (
    <section id="pricing" className="scroll-mt-24 px-5 py-24">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Pricing"
          title={
            <>
              Priced by the size <br className="hidden sm:block" />
              of your team.
            </>
          }
          lede={
            <>
              Every plan ships the entire suite — all nine modules, no feature
              gates. You only choose how many people you&apos;re running.
              Transparent SGD pricing, billed monthly, cancel anytime.
            </>
          }
        />

        {/* ── The instrument: a drafting ruler that sizes the whole page ── */}
        <Reveal delay={120} className="mt-12">
          <div
            className="lm-card relative overflow-hidden p-6 md:p-8"
            style={{ background: "var(--lm-panel)" }}
          >
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <span className="lm-eyebrow">Team size</span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span
                    className="lm-display text-[clamp(2.6rem,7vw,3.4rem)] tabular-nums"
                    style={{ color: "var(--lm-ink)" }}
                  >
                    {seats}
                  </span>
                  <span
                    className="text-lg font-medium"
                    style={{ color: "var(--lm-muted)" }}
                  >
                    {seats === 1 ? "employee" : "employees"}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <RulerStepper
                  label="Remove one employee"
                  onClick={() => setSeats((s) => clamp(s - 1))}
                  disabled={seats <= MIN}
                >
                  <Minus className="h-4 w-4" />
                </RulerStepper>
                <RulerStepper
                  label="Add one employee"
                  onClick={() => setSeats((s) => clamp(s + 1))}
                  disabled={seats >= MAX}
                >
                  <Plus className="h-4 w-4" />
                </RulerStepper>
                <span
                  className="lm-hand ml-1 hidden text-xl sm:inline"
                  style={{ color: "var(--lm-accent)" }}
                >
                  drag to size ↓
                </span>
              </div>
            </div>

            {/* Ruler */}
            <div className="mt-7">
              <input
                type="range"
                min={MIN}
                max={MAX}
                value={seats}
                onChange={(e) => setSeats(clamp(Number(e.target.value)))}
                aria-label="Number of employees"
                className="h-2.5 w-full cursor-pointer appearance-none rounded-full outline-none [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-[var(--lm-accent)] [&::-moz-range-thumb]:shadow-md [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[var(--lm-accent)] [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110"
                style={{
                  background: `linear-gradient(to right, var(--lm-accent) 0%, var(--lm-accent-2) ${fillPct}%, var(--lm-paper-2) ${fillPct}%, var(--lm-paper-2) 100%)`,
                }}
              />

              {/* Tier ticks — the ruler's engraved marks */}
              <div className="relative mt-3 h-9">
                {TICKS.map((t) => (
                  <div
                    key={t.seat}
                    className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
                    style={{ left: `${pctOf(t.seat)}%` }}
                  >
                    <span
                      className="h-2 w-px"
                      style={{ background: "var(--lm-line-2)" }}
                    />
                    <span
                      className="lm-mono mt-1 text-[0.68rem] whitespace-nowrap"
                      style={{ color: "var(--lm-muted)" }}
                    >
                      <span style={{ color: "var(--lm-ink-2)" }}>{t.seat}</span>{" "}
                      {t.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Presets */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span
                  className="lm-mono mr-1 text-xs"
                  style={{ color: "var(--lm-muted-2)" }}
                >
                  Jump to
                </span>
                {PRESETS.map((n) => {
                  const on = seats === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setSeats(n)}
                      className="lm-mono rounded-full px-3 py-1 text-xs transition-colors"
                      style={{
                        border: `1px solid ${on ? "var(--lm-accent)" : "var(--lm-line-2)"}`,
                        color: on ? "var(--lm-accent)" : "var(--lm-muted)",
                        background: on
                          ? "color-mix(in oklab, var(--lm-accent) 8%, transparent)"
                          : "transparent",
                      }}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Reveal>

        {/* ── Plan plates ── */}
        <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {PLAN_ORDER.map((key, i) => (
            <Reveal key={key} delay={80 * i}>
              <PlanPlate
                planKey={key}
                seats={seats}
                recommended={recommended === key}
              />
            </Reveal>
          ))}
        </div>

        {/* ── Shared manifest: everything's included ── */}
        <Reveal delay={120} className="mt-6">
          <div
            className="lm-card p-6 md:p-8"
            style={{ background: "var(--lm-panel-2)" }}
          >
            <div className="flex items-center gap-2.5">
              <span
                className="h-px w-8"
                style={{ background: "var(--lm-accent)" }}
                aria-hidden
              />
              <span className="lm-eyebrow">Included in every plan</span>
            </div>
            <ul className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              {PLAN_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5">
                  <span
                    className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full"
                    style={{
                      background:
                        "color-mix(in oklab, var(--lm-accent) 14%, transparent)",
                    }}
                  >
                    <Check
                      className="h-3 w-3"
                      style={{ color: "var(--lm-accent)" }}
                    />
                  </span>
                  <span
                    className="text-[0.92rem]"
                    style={{ color: "var(--lm-ink-2)" }}
                  >
                    {f}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function RulerStepper({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid h-10 w-10 place-items-center rounded-full transition-all disabled:opacity-35"
      style={{
        border: "1px solid var(--lm-line-2)",
        background: "var(--lm-panel)",
        color: "var(--lm-ink)",
        boxShadow: "var(--lm-shadow)",
      }}
    >
      {children}
    </button>
  );
}

function PlanPlate({
  planKey,
  seats,
  recommended,
}: {
  planKey: PlanKey;
  seats: number;
  recommended: boolean;
}) {
  const plan = PLANS[planKey];
  const isEnterprise = planKey === "enterprise";
  const popular = !!plan.popular;
  const total = computeMonthlyCents(planKey, seats);
  const over = extraSeats(planKey, seats);

  return (
    <div
      className="lm-card relative flex h-full flex-col p-6 transition-all duration-500"
      style={{
        borderColor: recommended ? "var(--lm-accent)" : "var(--lm-line)",
        boxShadow: recommended
          ? "0 2px 6px rgba(12,26,58,0.05), 0 26px 50px -26px color-mix(in oklab, var(--lm-accent) 60%, transparent)"
          : "var(--lm-shadow)",
      }}
    >
      {/* Top tabs */}
      <div className="flex h-5 items-center justify-between">
        {popular ? (
          <span
            className="lm-mono rounded-full px-2.5 py-0.5 text-[0.62rem] tracking-[0.16em] text-white uppercase"
            style={{
              background:
                "linear-gradient(180deg, var(--lm-accent-2), var(--lm-accent))",
            }}
          >
            Most popular
          </span>
        ) : (
          <span />
        )}
        {recommended && (
          <span
            className="lm-mono text-[0.62rem] tracking-[0.14em] uppercase"
            style={{ color: "var(--lm-accent)" }}
          >
            Best for {seats}
          </span>
        )}
      </div>

      <h3
        className="lm-display mt-4 text-2xl"
        style={{ color: "var(--lm-ink)" }}
      >
        {plan.name}
      </h3>
      <p
        className="mt-1.5 min-h-[3.25rem] text-[0.9rem] leading-snug"
        style={{ color: "var(--lm-muted)" }}
      >
        {plan.tagline}
      </p>

      {/* Price — the spec value */}
      <div
        className="mt-4 border-t pt-4"
        style={{ borderColor: "var(--lm-line)" }}
      >
        {isEnterprise || total === null ? (
          <div
            className="lm-display text-3xl"
            style={{ color: "var(--lm-ink)" }}
          >
            Custom
          </div>
        ) : (
          <div className="flex items-baseline gap-1.5">
            <span
              className="lm-display text-[2.4rem] leading-none tabular-nums"
              style={{ color: "var(--lm-ink)" }}
            >
              {formatSgd(total)}
            </span>
            <span
              className="lm-mono text-sm"
              style={{ color: "var(--lm-muted)" }}
            >
              /mo
            </span>
          </div>
        )}

        {/* Mono annotation — how the number is built */}
        <p
          className="lm-mono mt-2 min-h-[2.4rem] text-[0.72rem] leading-relaxed"
          style={{ color: "var(--lm-muted)" }}
        >
          {isEnterprise ? (
            <>150+ employees · tailored per-seat quote</>
          ) : over > 0 ? (
            <>
              {formatSgd(plan.baseCents!)} base
              <br />
              <span style={{ color: "var(--lm-accent)" }}>
                + {over} × {formatSgd(plan.extraSeatCents!, true)}/seat
              </span>
            </>
          ) : (
            <>up to {plan.includedSeats} employees included</>
          )}
        </p>
      </div>

      <div className="mt-5">
        <PlanCTA planKey={planKey} popular={popular} name={plan.name} />
      </div>

      <p
        className="lm-mono mt-4 text-[0.72rem]"
        style={{ color: "var(--lm-muted-2)" }}
      >
        Full HR suite ·{" "}
        {isEnterprise
          ? "unlimited scale"
          : `${plan.includedSeats} seats included`}
      </p>
    </div>
  );
}

function PlanCTA({
  planKey,
  popular,
  name,
}: {
  planKey: PlanKey;
  popular: boolean;
  name: string;
}) {
  if (planKey === "enterprise") {
    return (
      <Link href="/#contact" className="lm-btn lm-btn-ghost w-full">
        Talk to us <ArrowRight className="h-4 w-4" />
      </Link>
    );
  }
  const cls = `lm-btn w-full ${popular ? "lm-btn-primary" : "lm-btn-ghost"}`;
  return (
    <>
      <Unauthenticated>
        <SignUpButton mode="modal">
          <button className={cls}>
            Get started <ArrowRight className="h-4 w-4" />
          </button>
        </SignUpButton>
      </Unauthenticated>
      <Authenticated>
        <Link href="/hr-lounge/billing" className={cls}>
          Choose {name}
        </Link>
      </Authenticated>
    </>
  );
}
