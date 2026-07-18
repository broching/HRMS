"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  MapPin,
  CalendarCheck,
  Wallet,
  Receipt,
  Users,
} from "lucide-react";
import {
  DashboardScreen,
  LeaveScreen,
  PayrollScreen,
  ClaimsScreen,
  AttendanceScreen,
  OrgChartScreen,
} from "./screens";

const DWELL = 3800; // ms each feature holds before advancing

type Scene = {
  key: string;
  label: string;
  path: string;
  chip: { icon: React.ComponentType<{ className?: string }>; text: string; hue: string };
  screen: React.ReactNode;
};

const SCENES: Scene[] = [
  {
    key: "home",
    label: "Home",
    path: "/dashboard",
    chip: { icon: Check, text: "Leave approved", hue: "var(--lm-finance)" },
    screen: <DashboardScreen />,
  },
  {
    key: "leave",
    label: "Leave",
    path: "/leave/calendar",
    chip: { icon: CalendarCheck, text: "3 days · approved", hue: "var(--lm-hr)" },
    screen: <LeaveScreen />,
  },
  {
    key: "payroll",
    label: "Payroll",
    path: "/hr-lounge/payroll",
    chip: { icon: Wallet, text: "Payroll run · CPF ready", hue: "var(--lm-finance)" },
    screen: <PayrollScreen />,
  },
  {
    key: "claims",
    label: "Claims",
    path: "/claims",
    chip: { icon: Receipt, text: "Claim reimbursed", hue: "var(--lm-sales)" },
    screen: <ClaimsScreen />,
  },
  {
    key: "attendance",
    label: "Attendance",
    path: "/attendance",
    chip: { icon: MapPin, text: "Clocked in · 9:02 AM", hue: "var(--lm-accent)" },
    screen: <AttendanceScreen />,
  },
  {
    key: "people",
    label: "People",
    path: "/employees/org-chart",
    chip: { icon: Users, text: "Org chart updated", hue: "var(--lm-desk)" },
    screen: <OrgChartScreen />,
  },
];

function usePrefersReducedMotion() {
  const [reduce, setReduce] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const on = () => setReduce(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduce;
}

export function HrHero() {
  const [active, setActive] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const reduce = usePrefersReducedMotion();
  const scene = SCENES[active];

  // Auto-advance. Depending on `active` restarts the dwell whenever the scene
  // changes (including on a manual pick), so the progress bar and timer stay in
  // sync. Paused on hover/focus, and off entirely when reduced motion is asked.
  React.useEffect(() => {
    if (reduce || paused) return;
    const id = setTimeout(
      () => setActive((a) => (a + 1) % SCENES.length),
      DWELL,
    );
    return () => clearTimeout(id);
  }, [active, paused, reduce]);

  return (
    <section className="relative mx-auto max-w-6xl px-5 pt-32 pb-10 md:pt-40">
      <div className="grid items-center gap-10 md:grid-cols-[1fr_1.05fr] md:gap-12">
        {/* Left — the pitch */}
        <div>
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
            style={{
              border: "1px solid var(--lm-line-2)",
              background: "var(--lm-panel)",
              boxShadow: "var(--lm-shadow)",
            }}
          >
            <span
              className="grid h-4 w-4 place-items-center rounded-full text-white"
              style={{ background: "var(--lm-accent)" }}
            >
              <Check className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
            <span className="lm-eyebrow" style={{ letterSpacing: "0.14em" }}>
              LeadMightyHR · Available now
            </span>
          </div>

          <h1 className="lm-display mt-6 text-[clamp(2.4rem,5.6vw,4rem)]">
            Run your whole
            <br />
            team from <span className="lm-accent-text">one place.</span>
          </h1>

          <p
            className="mt-6 max-w-xl text-[1.06rem] leading-relaxed"
            style={{ color: "var(--lm-ink-2)" }}
          >
            People, leave, claims, payroll, attendance, performance and hiring —
            the whole HR stack, built Singapore-first with CPF-ready payroll.
            Nine modules that already work together, so nothing needs re-keying.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/#contact" className="lm-btn lm-btn-primary">
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#modules" className="lm-btn lm-btn-ghost">
              See the modules
            </a>
          </div>

          <div
            className="mt-8 flex flex-wrap gap-x-7 gap-y-2 text-sm"
            style={{ color: "var(--lm-muted)" }}
          >
            {["CPF-ready payroll", "Multi-currency claims", "QR + GPS attendance"].map(
              (t) => (
                <span key={t} className="inline-flex items-center gap-1.5">
                  <Check className="h-4 w-4" style={{ color: "var(--lm-accent)" }} />{" "}
                  {t}
                </span>
              ),
            )}
          </div>
        </div>

        {/* Right — a self-playing product tour that cycles through the modules */}
        <div
          className="relative"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={() => setPaused(false)}
        >
          <div className="lm-sheet lm-frame relative overflow-hidden">
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
                <span key={scene.key} style={{ animation: "lm-fade-up 500ms ease both" }}>
                  app.leadmighty.com{scene.path}
                </span>
              </span>
            </div>

            {/* Stacked scenes — the active one fades/rises in, the rest fade out */}
            <div className="relative h-[360px] sm:h-[400px] md:h-[430px]">
              {SCENES.map((s, i) => (
                <div
                  key={s.key}
                  aria-hidden={i !== active}
                  className="absolute inset-0 transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{
                    opacity: i === active ? 1 : 0,
                    transform:
                      i === active
                        ? "none"
                        : "translateY(14px) scale(0.985)",
                    pointerEvents: i === active ? "auto" : "none",
                  }}
                >
                  {s.screen}
                </div>
              ))}
            </div>
          </div>

          {/* Contextual status chip — swaps with the active feature */}
          <div
            key={scene.key}
            className="absolute -top-4 -left-5 hidden items-center gap-2 rounded-xl px-3 py-2 text-xs md:flex"
            style={{
              background: "var(--lm-panel)",
              border: "1px solid var(--lm-line)",
              boxShadow: "var(--lm-shadow-lg)",
              animation: "lm-fade-up 560ms cubic-bezier(0.22,1,0.36,1) both",
            }}
          >
            <span
              className="grid h-6 w-6 place-items-center rounded-full text-white"
              style={{ background: scene.chip.hue }}
            >
              <scene.chip.icon className="h-3.5 w-3.5" />
            </span>
            <span style={{ color: "var(--lm-ink)" }}>{scene.chip.text}</span>
          </div>

          {/* Feature pills — auto-advance indicator + jump control */}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {SCENES.map((s, i) => {
              const on = i === active;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-current={on}
                  className="relative overflow-hidden rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
                  style={{
                    border: `1px solid ${on ? "var(--lm-accent)" : "var(--lm-line-2)"}`,
                    color: on ? "var(--lm-accent)" : "var(--lm-muted)",
                    background: on
                      ? "color-mix(in oklab, var(--lm-accent) 8%, transparent)"
                      : "transparent",
                  }}
                >
                  {s.label}
                  {on && !reduce && (
                    <span
                      key={active}
                      className="lm-progress-bar absolute inset-x-0 bottom-0 h-0.5"
                      style={{
                        background: "var(--lm-accent)",
                        animationDuration: `${DWELL}ms`,
                        animationPlayState: paused ? "paused" : "running",
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
