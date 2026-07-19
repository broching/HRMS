"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Reveal } from "../../_components/reveal";
import { MODULES, MODULE_BY_SLUG } from "../modules-data";
import {
  DashboardScreen,
  OrgChartScreen,
  LeaveScreen,
  PayrollScreen,
  ClaimsScreen,
  AttendanceScreen,
  PerformanceScreen,
  RecruitmentScreen,
  ReportsScreen,
} from "../../leadmightyhr/_components/screens";

const SCREENS: Record<string, React.ReactNode> = {
  dashboard: <DashboardScreen />,
  people: <OrgChartScreen />,
  leave: <LeaveScreen />,
  payroll: <PayrollScreen />,
  claims: <ClaimsScreen />,
  attendance: <AttendanceScreen />,
  performance: <PerformanceScreen />,
  recruitment: <RecruitmentScreen />,
  reports: <ReportsScreen />,
};

const pad = (n: number) => String(n + 1).padStart(2, "0");

/* A hand-drawn connector arrow that draws itself in. `flip` mirrors it. */
function CalloutArrow({ flip = false, delay = 0 }: { flip?: boolean; delay?: number }) {
  return (
    <svg
      viewBox="0 0 90 60"
      className="h-12 w-[72px]"
      style={{ transform: flip ? "scaleX(-1)" : undefined }}
      aria-hidden
    >
      <path
        d="M6 8 C 30 10, 58 18, 76 46 M76 46 l-12 -4 M76 46 l2 -13"
        fill="none"
        stroke="var(--lm-accent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className="lm-ink-draw"
        style={{ animationDelay: `${delay}ms`, animationDuration: "900ms", opacity: 0.8 }}
      />
    </svg>
  );
}

export function ModuleSheet({ slug }: { slug: string }) {
  const m = MODULE_BY_SLUG[slug];
  const index = MODULES.findIndex((x) => x.slug === slug);
  const prev = MODULES[(index - 1 + MODULES.length) % MODULES.length];
  const next = MODULES[(index + 1) % MODULES.length];

  return (
    <div
      style={
        {
          "--lm-accent": m.hue,
          "--lm-accent-2": m.hue2,
        } as React.CSSProperties
      }
    >
      {/* ── Sheet header ─────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pt-32 md:pt-36">
        <div className="lm-enter flex flex-wrap items-center justify-between gap-3" style={{ "--d": "0ms" } as React.CSSProperties}>
          <Link
            href="/#modules"
            className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors hover:opacity-80"
            style={{ color: "var(--lm-muted)" }}
          >
            <ArrowLeft className="h-4 w-4" /> All modules
          </Link>
          <span className="lm-mono text-[11px]" style={{ letterSpacing: "0.22em", color: "var(--lm-accent)" }}>
            SHEET {pad(index)} / {pad(MODULES.length - 1)} · {m.name.toUpperCase()}
          </span>
        </div>

        <div className="mt-10 max-w-3xl">
          <h1 className="lm-display text-[clamp(2.3rem,5.4vw,3.9rem)]">
            <span className="lm-line-mask">
              <span style={{ "--d": "80ms" } as React.CSSProperties}>{m.headline[0]}</span>
            </span>
            <span className="lm-line-mask">
              <span style={{ "--d": "190ms" } as React.CSSProperties}>
                <span className="lm-accent-text lm-underline-draw">{m.headline[1]}</span>
              </span>
            </span>
          </h1>

          <p
            className="lm-enter mt-6 max-w-2xl text-[1.06rem] leading-relaxed"
            style={{ color: "var(--lm-ink-2)", "--d": "330ms" } as React.CSSProperties}
          >
            {m.intro}
          </p>

          <div
            className="lm-enter mt-7 flex flex-wrap items-center gap-3"
            style={{ "--d": "440ms" } as React.CSSProperties}
          >
            <Link href="/#contact" className="lm-btn lm-btn-primary">
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/#pricing" className="lm-btn lm-btn-ghost">
              See pricing
            </Link>
          </div>

          <div
            className="lm-enter mt-7 flex flex-wrap gap-x-7 gap-y-2 text-sm"
            style={{ color: "var(--lm-muted)", "--d": "540ms" } as React.CSSProperties}
          >
            {m.facts.map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4" style={{ color: "var(--lm-accent)" }} /> {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Annotated hero frame ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-5 pb-4 pt-12 md:pt-16">
        <div className="relative">
          {/* Hand-written drafting callouts (desktop only) */}
          <div className="pointer-events-none absolute -top-12 right-2 z-10 hidden items-end gap-1 lg:flex">
            <span className="lm-callout lm-enter max-w-[220px] text-right" style={{ "--d": "900ms" } as React.CSSProperties}>
              {m.callouts[0]}
            </span>
            <CalloutArrow delay={1150} />
          </div>
          <div className="pointer-events-none absolute -bottom-12 left-2 z-10 hidden items-start gap-1 lg:flex">
            <CalloutArrow flip delay={1450} />
            <span className="lm-callout lm-enter max-w-[240px] pt-6" style={{ "--d": "1250ms" } as React.CSSProperties}>
              {m.callouts[1]}
            </span>
          </div>

          <div className="lm-enter" style={{ "--d": "620ms" } as React.CSSProperties}>
            <div className="lm-frame">
              <div className="lm-frame-bar">
                <span className="lm-frame-dot" />
                <span className="lm-frame-dot" />
                <span className="lm-frame-dot" />
                <span
                  className="ml-2 flex-1 truncate rounded-md px-2.5 py-1 text-[11px]"
                  style={{
                    background: "var(--lm-panel)",
                    border: "1px solid var(--lm-line)",
                    color: "var(--lm-muted)",
                  }}
                >
                  app.leadmighty.com{m.path}
                </span>
                <span
                  className="lm-mono hidden text-[9px] sm:block"
                  style={{ letterSpacing: "0.14em", color: "var(--lm-accent)" }}
                >
                  MODULE / {m.name.toUpperCase()}
                </span>
              </div>
              {SCREENS[m.screenKey]}
            </div>
          </div>
        </div>

        {/* Engineering title block — the sheet's stamp. */}
        <Reveal delay={80}>
          <div
            className="lm-mono mt-16 grid grid-cols-2 overflow-hidden rounded-xl text-[10px] sm:grid-cols-4"
            style={{
              border: "1px solid var(--lm-line-2)",
              background: "var(--lm-panel)",
              boxShadow: "var(--lm-shadow)",
              letterSpacing: "0.12em",
            }}
          >
            {[
              { l: "SHEET", v: `${pad(index)} / ${pad(MODULES.length - 1)}` },
              { l: "MODULE", v: m.name.toUpperCase() },
              { l: "STATUS", v: "LIVE" },
              { l: "SUITE", v: "LEADMIGHTYHR" },
            ].map((c, i) => (
              <div
                key={c.l}
                className="px-4 py-3"
                style={{
                  borderLeft: i > 0 ? "1px solid var(--lm-line)" : "none",
                  borderTop: i >= 2 ? "1px solid var(--lm-line)" : "none",
                }}
              >
                <div style={{ color: "var(--lm-muted-2)" }}>{c.l}</div>
                <div className="mt-1 font-bold" style={{ color: c.l === "STATUS" ? "var(--lm-accent)" : "var(--lm-ink)" }}>
                  {c.v}
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ── Feature grid ─────────────────────────────────────────────────── */}
      <section className="lm-blueprint mt-16 py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-5">
          <Reveal>
            <p className="lm-eyebrow" style={{ color: "var(--lm-accent)" }}>
              What&apos;s inside
            </p>
            <h2 className="lm-display mt-3 max-w-2xl text-[clamp(1.8rem,3.6vw,2.6rem)]">
              Everything the {m.name.toLowerCase()} module does for you.
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {m.features.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 90}>
                <div
                  className="lm-feature-card h-full rounded-2xl p-5"
                  style={{
                    background: "var(--lm-panel)",
                    border: "1px solid var(--lm-line)",
                    boxShadow: "var(--lm-shadow)",
                  }}
                >
                  <div
                    className="grid h-10 w-10 place-items-center rounded-xl"
                    style={{
                      background: "color-mix(in oklab, var(--lm-accent) 12%, #fff)",
                      border: "1px solid color-mix(in oklab, var(--lm-accent) 26%, transparent)",
                    }}
                  >
                    <f.icon className="h-5 w-5" style={{ color: "var(--lm-accent)" }} />
                  </div>
                  <h3 className="lm-display mt-3.5 text-lg">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--lm-muted)" }}>
                    {f.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it runs ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <Reveal>
          <p className="lm-eyebrow" style={{ color: "var(--lm-accent)" }}>
            How it runs
          </p>
          <h2 className="lm-display mt-3 max-w-2xl text-[clamp(1.8rem,3.6vw,2.6rem)]">
            Three steps, start to finish.
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {m.steps.map((s, i) => (
            <Reveal key={s.title} delay={i * 120}>
              <div className="relative h-full rounded-2xl p-5 pt-6" style={{ background: "var(--lm-panel)", border: "1px solid var(--lm-line)", boxShadow: "var(--lm-shadow)" }}>
                <span
                  className="lm-mono absolute -top-3.5 left-5 rounded-full px-2.5 py-1 text-[11px] font-bold text-white"
                  style={{ background: "var(--lm-accent)", letterSpacing: "0.1em" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="lm-display text-lg">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--lm-muted)" }}>
                  {s.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Works with — the integration truth, as links. */}
        <Reveal delay={120}>
          <div className="mt-14 flex flex-wrap items-center gap-3">
            <span className="lm-eyebrow">Works with</span>
            {m.related.map((slug) => {
              const r = MODULE_BY_SLUG[slug];
              return (
                <Link
                  key={slug}
                  href={`/modules/${slug}`}
                  className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-transform hover:-translate-y-0.5"
                  style={{
                    background: "var(--lm-panel)",
                    border: "1px solid var(--lm-line-2)",
                    boxShadow: "var(--lm-shadow)",
                    color: "var(--lm-ink)",
                  }}
                >
                  <r.icon className="h-4 w-4" style={{ color: r.hue }} />
                  {r.name}
                  <ArrowRight className="h-3.5 w-3.5" style={{ color: "var(--lm-muted-2)" }} />
                </Link>
              );
            })}
          </div>
        </Reveal>
      </section>

      {/* ── CTA band ─────────────────────────────────────────────────────── */}
      <section className="lm-blueprint py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-5 text-center">
          <Reveal>
            <h2 className="lm-display mx-auto max-w-2xl text-[clamp(1.8rem,3.8vw,2.7rem)]">
              {m.name} is one of nine modules — <span className="lm-accent-text">already working together.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[1.02rem]" style={{ color: "var(--lm-ink-2)" }}>
              One login, one record of truth, no re-keying between systems. Try the whole suite with your team.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link href="/#contact" className="lm-btn lm-btn-primary">
                Get started <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/#modules" className="lm-btn lm-btn-ghost">
                See all modules
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Sheet pagination ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-10">
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href={`/modules/${prev.slug}`}
            className="lm-module-link flex items-center gap-3 rounded-2xl p-4"
            style={{ background: "var(--lm-panel)", border: "1px solid var(--lm-line)", boxShadow: "var(--lm-shadow)" }}
          >
            <ArrowLeft className="h-4 w-4 shrink-0" style={{ color: "var(--lm-muted-2)" }} />
            <div>
              <div className="lm-mono text-[10px]" style={{ letterSpacing: "0.18em", color: "var(--lm-muted)" }}>
                SHEET {pad(MODULES.indexOf(prev))}
              </div>
              <div className="lm-display text-lg">{prev.name}</div>
            </div>
          </Link>
          <Link
            href={`/modules/${next.slug}`}
            className="lm-module-link flex items-center justify-end gap-3 rounded-2xl p-4 text-right"
            style={{ background: "var(--lm-panel)", border: "1px solid var(--lm-line)", boxShadow: "var(--lm-shadow)" }}
          >
            <div>
              <div className="lm-mono text-[10px]" style={{ letterSpacing: "0.18em", color: "var(--lm-muted)" }}>
                SHEET {pad(MODULES.indexOf(next))}
              </div>
              <div className="lm-display text-lg">{next.name}</div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0" style={{ color: "var(--lm-muted-2)" }} />
          </Link>
        </div>
      </section>
    </div>
  );
}
