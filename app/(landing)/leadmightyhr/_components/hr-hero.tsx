"use client";

import Link from "next/link";
import { ArrowRight, Check, MapPin } from "lucide-react";
import { DashboardScreen } from "./screens";

export function HrHero() {
  return (
    <section className="relative mx-auto max-w-6xl px-5 pb-10 pt-32 md:pt-40">
      <div className="grid items-center gap-10 md:grid-cols-[1fr_1.05fr] md:gap-12">
        {/* Left — the pitch */}
        <div>
          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
            style={{ border: "1px solid var(--lm-line-2)", background: "var(--lm-panel)", boxShadow: "var(--lm-shadow)" }}
          >
            <span className="grid h-4 w-4 place-items-center rounded-full text-white" style={{ background: "var(--lm-accent)" }}>
              <Check className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
            <span className="lm-eyebrow" style={{ letterSpacing: "0.14em" }}>
              LeadMightyHR · Available now
            </span>
          </div>

          <h1 className="lm-display mt-6 text-[clamp(2.4rem,5.6vw,4rem)]">
            Run your whole
            <br />
            team from{" "}
            <span className="lm-accent-text">one place.</span>
          </h1>

          <p className="mt-6 max-w-xl text-[1.06rem] leading-relaxed" style={{ color: "var(--lm-ink-2)" }}>
            People, leave, claims, payroll, attendance, performance and hiring — the whole HR
            stack, built Singapore-first with CPF-ready payroll. Nine modules that already work
            together, so nothing needs re-keying.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/#contact" className="lm-btn lm-btn-primary">
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#modules" className="lm-btn lm-btn-ghost">
              See the modules
            </a>
          </div>

          <div className="mt-8 flex flex-wrap gap-x-7 gap-y-2 text-sm" style={{ color: "var(--lm-muted)" }}>
            {["CPF-ready payroll", "Multi-currency claims", "QR + GPS attendance"].map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4" style={{ color: "var(--lm-accent)" }} /> {t}
              </span>
            ))}
          </div>
        </div>

        {/* Right — the real product in a frame, with floating status chips */}
        <div className="relative">
          <div className="lm-frame">
            <div className="lm-frame-bar">
              <span className="lm-frame-dot" />
              <span className="lm-frame-dot" />
              <span className="lm-frame-dot" />
              <span
                className="ml-2 flex-1 truncate rounded-md px-2.5 py-1 text-[11px]"
                style={{ background: "var(--lm-panel)", border: "1px solid var(--lm-line)", color: "var(--lm-muted)" }}
              >
                app.leadmighty.com/dashboard
              </span>
            </div>
            <DashboardScreen />
          </div>

          {/* floating chips — straddle the frame edges so they don't cover UI */}
          <div
            className="absolute -left-5 -top-4 hidden items-center gap-2 rounded-xl px-3 py-2 text-xs md:flex"
            style={{ background: "var(--lm-panel)", border: "1px solid var(--lm-line)", boxShadow: "var(--lm-shadow-lg)", animation: "lm-bob 4s ease-in-out infinite" }}
          >
            <span className="grid h-6 w-6 place-items-center rounded-full text-white" style={{ background: "var(--lm-finance)" }}>
              <Check className="h-3.5 w-3.5" />
            </span>
            <span style={{ color: "var(--lm-ink)" }}>Leave approved</span>
          </div>
          <div
            className="absolute -bottom-4 -right-4 hidden items-center gap-2 rounded-xl px-3 py-2 text-xs md:flex"
            style={{ background: "var(--lm-panel)", border: "1px solid var(--lm-line)", boxShadow: "var(--lm-shadow-lg)", animation: "lm-bob 4s ease-in-out infinite", animationDelay: "1.2s" }}
          >
            <MapPin className="h-4 w-4" style={{ color: "var(--lm-accent)" }} />
            <span style={{ color: "var(--lm-ink)" }}>Clocked in · 9:02 AM</span>
          </div>
        </div>
      </div>
    </section>
  );
}
