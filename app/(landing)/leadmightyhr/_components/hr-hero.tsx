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
  slug: string; // /modules/[slug] deep-dive page
  chip: { icon: React.ComponentType<{ className?: string }>; text: string; hue: string };
  screen: React.ReactNode;
};

const SCENES: Scene[] = [
  {
    key: "home",
    label: "Home",
    path: "/dashboard",
    slug: "dashboard",
    chip: { icon: Check, text: "Leave approved", hue: "var(--lm-finance)" },
    screen: <DashboardScreen />,
  },
  {
    key: "leave",
    label: "Leave",
    path: "/leave/calendar",
    slug: "leave",
    chip: { icon: CalendarCheck, text: "3 days · approved", hue: "var(--lm-hr)" },
    screen: <LeaveScreen />,
  },
  {
    key: "payroll",
    label: "Payroll",
    path: "/hr-lounge/payroll",
    slug: "payroll",
    chip: { icon: Wallet, text: "Payroll run · CPF ready", hue: "var(--lm-finance)" },
    screen: <PayrollScreen />,
  },
  {
    key: "claims",
    label: "Claims",
    path: "/claims",
    slug: "claims",
    chip: { icon: Receipt, text: "Claim reimbursed", hue: "var(--lm-sales)" },
    screen: <ClaimsScreen />,
  },
  {
    key: "attendance",
    label: "Attendance",
    path: "/attendance",
    slug: "attendance",
    chip: { icon: MapPin, text: "Clocked in · 9:02 AM", hue: "var(--lm-accent)" },
    screen: <AttendanceScreen />,
  },
  {
    key: "people",
    label: "People",
    path: "/employees/org-chart",
    slug: "people",
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

/* The drafted "ghost" of the app window — a blueprint that draws itself in
   before the live product fades in over it, then recedes. Pure decoration. */
function FrameGhost() {
  const stroke = {
    fill: "none",
    stroke: "var(--lm-accent)",
    strokeWidth: 1.5,
    vectorEffect: "non-scaling-stroke" as const,
    strokeLinecap: "round" as const,
    pathLength: 1,
  };
  const draw = (delay: number, duration = 800) => ({
    className: "lm-ink-draw",
    style: { animationDelay: `${delay}ms`, animationDuration: `${duration}ms` },
  });
  return (
    <svg
      viewBox="0 0 640 470"
      preserveAspectRatio="none"
      className="lm-hero-ghost pointer-events-none absolute inset-0 z-10 h-full w-full"
      style={{ opacity: 0.7 }}
      aria-hidden
    >
      {/* Window outline + chrome bar */}
      <rect x="2" y="2" width="636" height="466" rx="14" {...stroke} {...draw(350, 1000)} />
      <path d="M2 38 H638" {...stroke} {...draw(700)} />
      <rect x="64" y="10" width="420" height="19" rx="7" {...stroke} {...draw(820)} />
      <path d="M14 19 h8 M30 19 h8 M46 19 h8" {...stroke} {...draw(900, 500)} />
      {/* Skeleton layout: left column card + right action grid */}
      <rect x="18" y="56" width="252" height="150" rx="10" {...stroke} {...draw(1000)} />
      <path d="M36 86 h90 M36 106 h140 M36 126 h120" {...stroke} {...draw(1150, 600)} />
      <rect x="18" y="222" width="252" height="120" rx="10" {...stroke} {...draw(1150)} />
      <rect x="292" y="56" width="160" height="138" rx="10" {...stroke} {...draw(1300)} />
      <rect x="464" y="56" width="160" height="138" rx="10" {...stroke} {...draw(1380)} />
      <rect x="292" y="208" width="160" height="138" rx="10" {...stroke} {...draw(1460)} />
      <rect x="464" y="208" width="160" height="138" rx="10" {...stroke} {...draw(1540)} />
      {/* Dimension line — the drafter measuring the sheet */}
      <path d="M18 430 H624 M18 424 v12 M624 424 v12" {...stroke} {...draw(1650, 700)} />
    </svg>
  );
}

export function HrHero() {
  const [active, setActive] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const reduce = usePrefersReducedMotion();
  const scene = SCENES[active];
  const tiltRef = React.useRef<HTMLDivElement>(null);

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

  const onTilt = (e: React.MouseEvent<HTMLDivElement>) => {
    if (reduce) return;
    const el = tiltRef.current;
    if (!el) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--tilt-x", `${(-y * 4).toFixed(2)}deg`);
    el.style.setProperty("--tilt-y", `${(x * 5).toFixed(2)}deg`);
  };
  const resetTilt = () => {
    const el = tiltRef.current;
    if (!el) return;
    el.style.setProperty("--tilt-x", "0deg");
    el.style.setProperty("--tilt-y", "0deg");
  };

  return (
    <section className="relative mx-auto max-w-6xl px-5 pt-32 pb-10 md:pt-40">
      <div className="grid items-center gap-10 md:grid-cols-[1fr_1.05fr] md:gap-12">
        {/* Left — the pitch, staged in on load */}
        <div>
          <div
            className="lm-enter inline-flex items-center gap-2 rounded-full px-3 py-1.5"
            style={
              {
                border: "1px solid var(--lm-line-2)",
                background: "var(--lm-panel)",
                boxShadow: "var(--lm-shadow)",
                "--d": "0ms",
              } as React.CSSProperties
            }
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
            <span className="lm-line-mask">
              <span style={{ "--d": "80ms" } as React.CSSProperties}>
                Run your whole
              </span>
            </span>
            <span className="lm-line-mask">
              <span style={{ "--d": "190ms" } as React.CSSProperties}>
                team from{" "}
                <span className="lm-accent-text lm-underline-draw">one place.</span>
              </span>
            </span>
          </h1>

          <p
            className="lm-enter mt-6 max-w-xl text-[1.06rem] leading-relaxed"
            style={{ color: "var(--lm-ink-2)", "--d": "330ms" } as React.CSSProperties}
          >
            People, leave, claims, payroll, attendance, performance and hiring —
            the whole HR stack, built Singapore-first with CPF-ready payroll.
            Nine modules that already work together, so nothing needs re-keying.
          </p>

          <div
            className="lm-enter mt-8 flex flex-wrap items-center gap-3"
            style={{ "--d": "440ms" } as React.CSSProperties}
          >
            <Link href="/#contact" className="lm-btn lm-btn-primary">
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#modules" className="lm-btn lm-btn-ghost">
              See the modules
            </a>
          </div>

          <div
            className="lm-enter mt-8 flex flex-wrap gap-x-7 gap-y-2 text-sm"
            style={{ color: "var(--lm-muted)", "--d": "540ms" } as React.CSSProperties}
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

        {/* Right — a self-playing product tour. On load, its blueprint draws
            itself first; then the live product fades in over the draft. */}
        <div
          className="relative"
          style={{ perspective: "1100px" }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => {
            setPaused(false);
            resetTilt();
          }}
          onMouseMove={onTilt}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={() => setPaused(false)}
        >
          <div ref={tiltRef} className="lm-tilt relative">
            <FrameGhost />
            <div className="lm-hero-frame-in">
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
            </div>

            {/* Contextual status chip — swaps with the active feature */}
            <div
              className="lm-enter absolute -top-4 -left-5 hidden md:block"
              style={{ "--d": "1900ms" } as React.CSSProperties}
            >
              <div
                key={scene.key}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs"
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
            </div>

            {/* A drafter's note — the one hand-written mark on the sheet */}
            <span
              className="lm-callout lm-enter absolute -right-3 -bottom-5 hidden lg:block"
              style={{ "--d": "2100ms" } as React.CSSProperties}
            >
              live product — not a mockup
            </span>
          </div>

          {/* Feature pills — auto-advance indicator + jump control */}
          <div
            className="lm-enter mt-5 flex flex-wrap justify-center gap-2"
            style={{ "--d": "1250ms" } as React.CSSProperties}
          >
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

          {/* Deep link into the active module's spec sheet */}
          <div
            className="lm-enter mt-3 text-center text-sm"
            style={{ "--d": "1450ms" } as React.CSSProperties}
          >
            <Link
              key={scene.key}
              href={`/modules/${scene.slug}`}
              className="inline-flex items-center gap-1.5 font-semibold transition-opacity hover:opacity-75"
              style={{
                color: "var(--lm-accent)",
                animation: "lm-fade-up 500ms ease both",
              }}
            >
              Explore the {scene.label} module <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
