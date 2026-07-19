"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, Minus, Plus, Check } from "lucide-react";
import { Authenticated, Unauthenticated } from "convex/react";
import { SignUpButton } from "@clerk/nextjs";
import { SectionHeading } from "./section-heading";
import { Reveal } from "./reveal";
import {
  CORE_MAX_SEATS,
  CORE_TIERS,
  EXTRA_SEAT_CENTS,
  MODULE_PRICING,
  ENTERPRISE,
  computeBillingCents,
  coreBreakdown,
  formatSgd,
  type OptionalModuleKey,
} from "@/convex/lib/plans";
import { OPTIONAL_MODULES, MODULE_META } from "@/convex/lib/modules";

const MIN = 1;
const MAX = CORE_MAX_SEATS;

const pctOf = (s: number) => ((s - MIN) / (MAX - MIN)) * 100;
const clamp = (n: number) =>
  Number.isNaN(n) ? MIN : Math.min(MAX, Math.max(MIN, Math.round(n)));

const MODS = OPTIONAL_MODULES as OptionalModuleKey[];

export function PricingSection() {
  const [seats, setSeats] = React.useState(12);
  const [selected, setSelected] = React.useState<Set<OptionalModuleKey>>(
    () => new Set(MODS),
  );
  const fillPct = pctOf(seats);

  const modules = MODS.filter((m) => selected.has(m));
  const cost = computeBillingCents(seats, modules);
  const core = coreBreakdown(seats);

  const toggle = (k: OptionalModuleKey) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <section id="pricing" className="scroll-mt-24 px-5 py-24">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Pricing"
          title={
            <>
              Pay only for the <br className="hidden sm:block" />
              modules you use.
            </>
          }
          lede={
            <>
              A per-employee Core platform plus flat monthly add-ons — switch
              modules on and off as you grow. Transparent SGD pricing, billed
              monthly, cancel anytime.
            </>
          }
        />

        {/* ── The instrument: the headcount ruler drives the Core fee ── */}
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
                <p
                  className="lm-mono mt-1 text-[0.72rem]"
                  style={{ color: "var(--lm-muted-2)" }}
                >
                  Core platform ={" "}
                  {formatSgd(cost.baseCents)}/mo
                  {core.extraSeats > 0
                    ? ` · ${formatSgd(core.tierCents)} tier + ${core.extraSeats} × ${formatSgd(EXTRA_SEAT_CENTS)}`
                    : " · scales with team size"}
                </p>
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

              {/* Price per tier — the Core anchors, each showing its flat price.
                  Between anchors, headcount is +S$5/employee. */}
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className="lm-mono text-xs"
                    style={{ color: "var(--lm-muted-2)" }}
                  >
                    Price per tier
                  </span>
                  <span
                    className="lm-mono text-xs"
                    style={{ color: "var(--lm-muted-2)" }}
                  >
                    +{formatSgd(EXTRA_SEAT_CENTS)}/employee between tiers
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {CORE_TIERS.map((t) => {
                    const on = core.tierUpTo === t.upTo;
                    return (
                      <button
                        key={t.upTo}
                        type="button"
                        onClick={() => setSeats(t.upTo)}
                        className="flex flex-col items-center gap-0.5 rounded-xl px-2 py-2.5 transition-colors"
                        style={{
                          border: `1px solid ${on ? "var(--lm-accent)" : "var(--lm-line-2)"}`,
                          background: on
                            ? "color-mix(in oklab, var(--lm-accent) 8%, transparent)"
                            : "transparent",
                        }}
                      >
                        <span
                          className="lm-mono text-[0.68rem]"
                          style={{ color: "var(--lm-muted-2)" }}
                        >
                          {t.upTo} {t.upTo === 1 ? "seat" : "seats"}
                        </span>
                        <span
                          className="text-sm font-semibold tabular-nums"
                          style={{
                            color: on ? "var(--lm-accent)" : "var(--lm-ink)",
                          }}
                        >
                          {formatSgd(t.cents)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </Reveal>

        {/* ── Module picker + running total ── */}
        <div className="relative mt-6">
          <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
          <Reveal>
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
                <span className="lm-eyebrow">Choose your modules</span>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {MODS.map((key) => {
                  const on = selected.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggle(key)}
                      className="lm-card flex items-start justify-between gap-3 p-4 text-left transition-all"
                      style={{
                        borderColor: on ? "var(--lm-accent)" : "var(--lm-line)",
                        background: on
                          ? "color-mix(in oklab, var(--lm-accent) 6%, transparent)"
                          : "transparent",
                      }}
                    >
                      <div className="min-w-0">
                        <div
                          className="font-medium"
                          style={{ color: "var(--lm-ink)" }}
                        >
                          {MODULE_META[key].name}
                        </div>
                        <p
                          className="mt-0.5 text-[0.78rem] leading-relaxed"
                          style={{ color: "var(--lm-muted)" }}
                        >
                          {MODULE_META[key].description}
                        </p>
                        <div
                          className="lm-mono mt-2 text-sm"
                          style={{ color: "var(--lm-ink-2)" }}
                        >
                          {formatSgd(MODULE_PRICING[key].monthlyCents)}/mo
                        </div>
                      </div>
                      <span
                        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors"
                        style={{
                          borderColor: on
                            ? "var(--lm-accent)"
                            : "var(--lm-line-2)",
                          background: on ? "var(--lm-accent)" : "transparent",
                        }}
                        aria-hidden
                      >
                        {on && <Check className="h-3 w-3 text-white" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </Reveal>

          {/* Summary plate */}
          <Reveal delay={80}>
            <div
              className="lm-card h-fit p-6 lg:sticky lg:top-24"
              style={{ background: "var(--lm-panel)" }}
            >
              <span className="lm-eyebrow">Your monthly plan</span>
              <div className="mt-4 flex flex-col gap-2 text-sm">
                <Line
                  label={`Core · ${seats} ${seats === 1 ? "employee" : "employees"}`}
                  value={formatSgd(cost.baseCents)}
                />
                {modules.map((m) => (
                  <Line
                    key={m}
                    label={MODULE_META[m].name}
                    value={formatSgd(MODULE_PRICING[m].monthlyCents)}
                  />
                ))}
              </div>
              <div
                className="mt-4 flex items-baseline justify-between border-t pt-4"
                style={{ borderColor: "var(--lm-line)" }}
              >
                <span
                  className="text-sm font-medium"
                  style={{ color: "var(--lm-muted)" }}
                >
                  Total
                </span>
                <span
                  className="lm-display text-[2.2rem] leading-none tabular-nums"
                  style={{ color: "var(--lm-ink)" }}
                >
                  {formatSgd(cost.totalCents)}
                  <span
                    className="lm-mono ml-1 text-sm"
                    style={{ color: "var(--lm-muted)" }}
                  >
                    /mo
                  </span>
                </span>
              </div>
              <div className="mt-5">
                <PlanCTA />
              </div>
              <p
                className="lm-mono mt-4 text-[0.72rem]"
                style={{ color: "var(--lm-muted-2)" }}
              >
                {modules.length} of {MODS.length} modules · billed monthly ·
                cancel anytime
              </p>
            </div>
          </Reveal>
          </div>

          {/* Mobile: the running total stays pinned to the bottom of the screen
              so the price is always visible while you scroll the toggles above
              it. Scoped to this configurator so it releases before Enterprise. */}
          <div className="lg:hidden sticky bottom-3 z-30 mt-4">
            <div
              className="lm-card flex items-center justify-between gap-3 px-4 py-3"
              style={{
                background: "color-mix(in oklab, var(--lm-panel) 90%, transparent)",
                backdropFilter: "blur(12px)",
              }}
            >
              <div className="min-w-0">
                <div
                  className="lm-mono text-[0.64rem]"
                  style={{ color: "var(--lm-muted-2)" }}
                >
                  {seats} {seats === 1 ? "employee" : "employees"} ·{" "}
                  {modules.length} module{modules.length === 1 ? "" : "s"}
                </div>
                <div
                  className="lm-display text-[1.55rem] leading-none tabular-nums"
                  style={{ color: "var(--lm-ink)" }}
                >
                  {formatSgd(cost.totalCents)}
                  <span
                    className="lm-mono ml-1 text-xs"
                    style={{ color: "var(--lm-muted)" }}
                  >
                    /mo
                  </span>
                </div>
              </div>
              <PlanCTA compact />
            </div>
          </div>
        </div>

        {/* ── Enterprise band (sales-led, dedicated deployment) ── */}
        <Reveal delay={120} className="mt-6">
          <div
            className="lm-card overflow-hidden p-6 md:p-8"
            style={{ background: "var(--lm-panel)" }}
          >
            <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <span className="lm-eyebrow">Enterprise</span>
                <h3
                  className="lm-display mt-2 text-[clamp(1.5rem,3.4vw,2rem)]"
                  style={{ color: "var(--lm-ink)" }}
                >
                  A dedicated deployment, on your own domain.
                </h3>
                <p
                  className="mt-2 max-w-xl text-sm leading-relaxed"
                  style={{ color: "var(--lm-muted)" }}
                >
                  {ENTERPRISE.tagline} Your own database and keys, configured to
                  your workflows, with dedicated support — billed on a custom
                  quote.
                </p>
                <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                  {ENTERPRISE.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-sm"
                      style={{ color: "var(--lm-ink-2)" }}
                    >
                      <Check
                        className="mt-0.5 h-4 w-4 shrink-0"
                        style={{ color: "var(--lm-accent)" }}
                      />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col items-start gap-3 md:items-end">
                <Link href="#contact" className="lm-btn lm-btn-primary">
                  Talk to sales <ArrowRight className="h-4 w-4" />
                </Link>
                <span
                  className="lm-mono text-[0.72rem]"
                  style={{ color: "var(--lm-muted-2)" }}
                >
                  Custom quote · dedicated support
                </span>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: "var(--lm-muted)" }}>{label}</span>
      <span
        className="font-medium tabular-nums"
        style={{ color: "var(--lm-ink-2)" }}
      >
        {value}
      </span>
    </div>
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

function PlanCTA({ compact }: { compact?: boolean }) {
  const cls = compact
    ? "lm-btn lm-btn-primary shrink-0 !px-4 !py-2.5 text-sm"
    : "lm-btn lm-btn-primary w-full";
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
          {compact ? "Build plan" : "Build your plan"}{" "}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Authenticated>
    </>
  );
}
