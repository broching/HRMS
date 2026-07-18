"use client";

import React from "react";
import { Target, UsersRound, LineChart } from "lucide-react";
import { Reveal } from "../../_components/reveal";
import {
  DashboardScreen,
  OrgChartScreen,
  LeaveScreen,
  PayrollScreen,
  ClaimsScreen,
  AttendanceScreen,
} from "./screens";

// A browser-style frame the recreations live inside — signals "this is the
// product," while the drafting tag keeps it in the blueprint register.
function Frame({ tag, path, children }: { tag: string; path: string; children: React.ReactNode }) {
  return (
    <div className="lm-sheet lm-frame">
      <div className="lm-frame-bar">
        <span className="lm-frame-dot" />
        <span className="lm-frame-dot" />
        <span className="lm-frame-dot" />
        <span
          className="ml-2 flex-1 truncate rounded-md px-2.5 py-1 text-[11px]"
          style={{ background: "var(--lm-panel)", border: "1px solid var(--lm-line)", color: "var(--lm-muted)" }}
        >
          app.leadmighty.com{path}
        </span>
        <span className="lm-mono hidden text-[9px] sm:block" style={{ letterSpacing: "0.14em", color: "var(--lm-accent)" }}>
          {tag}
        </span>
      </div>
      {children}
    </div>
  );
}

type Feature = {
  tag: string;
  path: string;
  title: string;
  body: string;
  screen: React.ReactNode;
};

const FEATURES: Feature[] = [
  {
    tag: "MODULE / HOME",
    path: "/dashboard",
    title: "Everyone's home base",
    body: "The first thing your team sees: their leave balance, next payday, what's waiting on their approval, and who's out today. No manual, no training.",
    screen: <DashboardScreen />,
  },
  {
    tag: "MODULE / PEOPLE",
    path: "/employees/org-chart",
    title: "One source of truth for who's who",
    body: "Employee records, documents and a live org chart that redraws itself as people join, move teams and get promoted. Everyone can see how the company fits together.",
    screen: <OrgChartScreen />,
  },
  {
    tag: "MODULE / LEAVE",
    path: "/leave/calendar",
    title: "Time off without the email chains",
    body: "Set your policies once. Staff request, managers approve in a tap, and a shared calendar keeps everyone honest about who's away and when.",
    screen: <LeaveScreen />,
  },
  {
    tag: "MODULE / PAYROLL",
    path: "/hr-lounge/payroll",
    title: "Payroll that already knows Singapore",
    body: "CPF, SDL and payslips handled for you. Run the month in a few clicks, with every figure traceable straight back to the person it belongs to.",
    screen: <PayrollScreen />,
  },
  {
    tag: "MODULE / CLAIMS",
    path: "/claims",
    title: "Claims that pay themselves out",
    body: "Snap a receipt in any currency. It converts, routes to the right approvers, and settles straight through payroll — no spreadsheet in the middle.",
    screen: <ClaimsScreen />,
  },
  {
    tag: "MODULE / ATTENDANCE",
    path: "/attendance",
    title: "A time clock in everyone's pocket",
    body: "A rotating QR code and a GPS check turn any phone into an attendance terminal — no turnstiles to buy. Corrections and daily records stay tidy for payroll.",
    screen: <AttendanceScreen />,
  },
];

const MORE = [
  { icon: Target, name: "Performance", desc: "Appraisal cycles with weighted objectives, competencies and anonymous 360 feedback." },
  { icon: UsersRound, name: "Recruitment", desc: "A candidate pipeline and a public careers board hosted on your own URL." },
  { icon: LineChart, name: "Reports", desc: "Headcount, attrition, leave and payroll analytics — plus a build-your-own exporter." },
];

export function ModuleShowcase() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-8">
      <div className="flex flex-col gap-20 md:gap-28">
        {FEATURES.map((f, i) => {
          const flip = i % 2 === 1;
          return (
            <div key={f.tag} className="grid items-center gap-8 md:grid-cols-2 md:gap-14">
              <Reveal className={flip ? "md:order-2" : ""} delay={80}>
                <div>
                  <span className="lm-mono text-[11px]" style={{ letterSpacing: "0.18em", color: "var(--lm-accent)" }}>
                    {f.tag}
                  </span>
                  <h3 className="lm-display mt-3 text-[clamp(1.6rem,3vw,2.2rem)]">{f.title}</h3>
                  <p className="mt-3 text-[1.02rem] leading-relaxed" style={{ color: "var(--lm-ink-2)" }}>
                    {f.body}
                  </p>
                </div>
              </Reveal>
              <Reveal className={flip ? "md:order-1" : ""} delay={160}>
                <Frame tag={f.tag.split("/ ")[1]} path={f.path}>
                  {f.screen}
                </Frame>
              </Reveal>
            </div>
          );
        })}
      </div>

      {/* Compact strip for the remaining modules */}
      <div className="mt-24 md:mt-28">
        <Reveal>
          <p className="lm-eyebrow text-center">And there&apos;s more in the box</p>
        </Reveal>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {MORE.map((m, i) => (
            <Reveal key={m.name} delay={i * 90}>
              <div className="h-full rounded-2xl p-5" style={{ background: "var(--lm-panel)", border: "1px solid var(--lm-line)", boxShadow: "var(--lm-shadow)" }}>
                <div className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: "color-mix(in oklab, var(--lm-accent) 12%, #fff)", border: "1px solid color-mix(in oklab, var(--lm-accent) 26%, transparent)" }}>
                  <m.icon className="h-5 w-5" style={{ color: "var(--lm-accent)" }} />
                </div>
                <h4 className="lm-display mt-3.5 text-lg">{m.name}</h4>
                <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--lm-muted)" }}>{m.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
