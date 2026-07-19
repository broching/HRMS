"use client";

import React from "react";
import {
  Plane,
  Wallet,
  ClipboardCheck,
  ArrowRight,
  Check,
  QrCode,
  MapPin,
} from "lucide-react";

// ── Faithful, on-brand recreations of the real LeadMightyHR modules. These are
// live-rendered representations (not screenshots), so they stay crisp at any
// size and match the drafting theme. Data is illustrative but shaped like the
// real app: SG names, CPF payroll, multi-currency claims, QR attendance.

function Avatar({ name, hue = "var(--lm-accent)" }: { name: string; hue?: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  return (
    <span
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-semibold"
      style={{ background: `color-mix(in oklab, ${hue} 14%, #fff)`, color: hue, border: `1px solid color-mix(in oklab, ${hue} 26%, transparent)` }}
    >
      {initials}
    </span>
  );
}

const screenCard: React.CSSProperties = {
  background: "var(--lm-panel)",
  border: "1px solid var(--lm-line)",
  borderRadius: 12,
};

// ── 1. Personal dashboard ───────────────────────────────────────────────────
export function DashboardScreen() {
  return (
    <div className="grid gap-3 p-4 text-[13px] md:grid-cols-[0.9fr_1.1fr]" style={{ color: "var(--lm-ink)" }}>
      <div className="flex flex-col gap-3">
        <div className="p-3" style={screenCard}>
          <div className="flex items-center gap-2.5">
            <Avatar name="Wei Ling" />
            <div>
              <div className="font-semibold leading-tight">Wei Ling Tan</div>
              <div className="text-[11px]" style={{ color: "var(--lm-muted)" }}>
                Product Designer · Design
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              { l: "Leave left", v: "14 days" },
              { l: "Next payday", v: "25 Jul" },
            ].map((s) => (
              <div key={s.l} className="rounded-lg px-2.5 py-2" style={{ background: "var(--lm-panel-2)" }}>
                <div className="text-[10px]" style={{ color: "var(--lm-muted)" }}>{s.l}</div>
                <div className="font-semibold">{s.v}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="p-3" style={screenCard}>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--lm-muted)" }}>
            Who&apos;s away today
          </div>
          {[
            { n: "Arjun Mehta", t: "Annual leave" },
            { n: "Siti Rahman", t: "Working from home" },
          ].map((p) => (
            <div key={p.n} className="flex items-center gap-2 py-1">
              <Avatar name={p.n} hue="var(--lm-sales)" />
              <div className="leading-tight">
                <div className="font-medium">{p.n}</div>
                <div className="text-[11px]" style={{ color: "var(--lm-muted)" }}>{p.t}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: Plane, l: "Apply for leave", d: "14 days annual left" },
          { icon: Wallet, l: "Submit a claim", d: "2 pending" },
          { icon: ClipboardCheck, l: "Approvals", d: "3 waiting on you", badge: true },
          { icon: QrCode, l: "Clock in", d: "Since 9:02 AM" },
        ].map((t) => (
          <div key={t.l} className="relative flex flex-col justify-between p-3" style={screenCard}>
            {t.badge && (
              <span className="absolute right-2 top-2 h-4 min-w-4 rounded-full px-1 text-center text-[10px] font-bold leading-4 text-white" style={{ background: "var(--lm-desk)" }}>
                3
              </span>
            )}
            <div className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: "color-mix(in oklab, var(--lm-accent) 12%, #fff)" }}>
              <t.icon className="h-4 w-4" style={{ color: "var(--lm-accent)" }} />
            </div>
            <div className="mt-3">
              <div className="font-semibold leading-tight">{t.l}</div>
              <div className="text-[11px]" style={{ color: "var(--lm-muted)" }}>{t.d}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 2. Org chart ────────────────────────────────────────────────────────────
export function OrgChartScreen() {
  const node = (name: string, role: string, hue: string) => (
    <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5" style={{ ...screenCard, boxShadow: "var(--lm-shadow)" }}>
      <Avatar name={name} hue={hue} />
      <div className="leading-tight">
        <div className="text-[12px] font-semibold" style={{ color: "var(--lm-ink)" }}>{name}</div>
        <div className="text-[10px]" style={{ color: "var(--lm-muted)" }}>{role}</div>
      </div>
    </div>
  );
  return (
    <div className="relative p-5">
      <div className="mx-auto flex w-fit flex-col items-center">
        {node("Daniel Koh", "Chief Executive", "var(--lm-accent)")}
        <svg viewBox="0 0 260 34" className="my-1 h-8 w-[260px]" aria-hidden>
          <path d="M130 2 V12 M40 32 V22 H220 V32 M130 12 V22" fill="none" stroke="var(--lm-line-2)" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <div className="flex gap-6">
          <div className="flex flex-col items-center gap-2">
            {node("Priya Nair", "Head of People", "var(--lm-sales)")}
            <div className="flex flex-col gap-1.5">
              {node("Wei Ling Tan", "Designer", "var(--lm-finance)")}
              {node("Marcus Tan", "Recruiter", "var(--lm-finance)")}
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            {node("Arjun Mehta", "Head of Eng", "var(--lm-sales)")}
            <div className="flex flex-col gap-1.5">
              {node("Siti Rahman", "Engineer", "var(--lm-finance)")}
              {node("Chen Wei", "Engineer", "var(--lm-finance)")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 3. Leave calendar ───────────────────────────────────────────────────────
export function LeaveScreen() {
  const days = Array.from({ length: 35 }, (_, i) => i - 2); // offset so 1st isn't Monday
  const marks: Record<number, { c: string; label: string }> = {
    8: { c: "var(--lm-accent)", label: "A" },
    9: { c: "var(--lm-accent)", label: "A" },
    15: { c: "var(--lm-finance)", label: "W" },
    22: { c: "var(--lm-desk)", label: "S" },
  };
  return (
    <div className="p-4 text-[12px]" style={{ color: "var(--lm-ink)" }}>
      <div className="mb-2 flex items-center justify-between">
        <div className="font-semibold">July 2026</div>
        <div className="flex gap-2 text-[10px]" style={{ color: "var(--lm-muted)" }}>
          <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full" style={{ background: "var(--lm-accent)" }} />Annual</span>
          <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full" style={{ background: "var(--lm-desk)" }} />Sick</span>
          <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full" style={{ background: "var(--lm-finance)" }} />WFH</span>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-medium" style={{ color: "var(--lm-muted)" }}>{d}</div>
        ))}
        {days.map((d, i) => {
          const valid = d >= 1 && d <= 31;
          const m = marks[d];
          return (
            <div
              key={i}
              className="grid aspect-square place-items-center rounded-md text-[11px]"
              style={{
                background: m ? m.c : valid ? "var(--lm-panel-2)" : "transparent",
                color: m ? "#fff" : valid ? "var(--lm-ink-2)" : "transparent",
                border: valid && !m ? "1px solid var(--lm-line)" : "none",
                fontWeight: m ? 700 : 400,
              }}
            >
              {valid ? d : ""}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between rounded-lg px-3 py-2" style={{ background: "var(--lm-panel-2)", border: "1px solid var(--lm-line)" }}>
        <div className="flex items-center gap-2">
          <Avatar name="Arjun Mehta" hue="var(--lm-accent)" />
          <span>Arjun — Annual leave, 9–10 Jul</span>
        </div>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ background: "var(--lm-finance)" }}>Approved</span>
      </div>
    </div>
  );
}

// ── 4. Payroll (SG CPF) ─────────────────────────────────────────────────────
export function PayrollScreen() {
  const rows = [
    { l: "Gross salary", v: "S$5,400.00", sub: false },
    { l: "CPF — employee (20%)", v: "− S$1,080.00", sub: true },
    { l: "CPF — employer (17%)", v: "S$918.00", sub: true },
    { l: "SDL", v: "− S$5.40", sub: true },
  ];
  return (
    <div className="p-4 text-[12px]" style={{ color: "var(--lm-ink)" }}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="font-semibold">July 2026 payroll run</div>
          <div className="text-[10px]" style={{ color: "var(--lm-muted)" }}>24 employees · CPF applied</div>
        </div>
        <span className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold text-white" style={{ background: "var(--lm-finance)" }}>Finalised</span>
      </div>
      <div className="overflow-hidden rounded-lg" style={{ border: "1px solid var(--lm-line)" }}>
        <div className="flex items-center gap-2 px-3 py-2" style={{ background: "var(--lm-panel-2)" }}>
          <Avatar name="Wei Ling" />
          <span className="font-medium">Wei Ling Tan · payslip</span>
        </div>
        {rows.map((r) => (
          <div key={r.l} className="flex items-center justify-between px-3 py-1.5" style={{ borderTop: "1px solid var(--lm-line)", color: r.sub ? "var(--lm-muted)" : "var(--lm-ink)" }}>
            <span>{r.l}</span>
            <span className="lm-mono">{r.v}</span>
          </div>
        ))}
        <div className="flex items-center justify-between px-3 py-2" style={{ borderTop: "1.5px solid var(--lm-line-2)", background: "color-mix(in oklab, var(--lm-accent) 6%, #fff)" }}>
          <span className="font-semibold">Net pay</span>
          <span className="lm-mono font-bold" style={{ color: "var(--lm-accent)" }}>S$4,314.60</span>
        </div>
      </div>
    </div>
  );
}

// ── 5. Expense claims (multi-currency + approval chain) ──────────────────────
export function ClaimsScreen() {
  const steps = [
    { l: "Submitted", done: true },
    { l: "Manager", done: true },
    { l: "Finance", done: true },
    { l: "Paid", done: false },
  ];
  return (
    <div className="p-4 text-[12px]" style={{ color: "var(--lm-ink)" }}>
      <div className="p-3" style={{ ...screenCard, background: "var(--lm-panel-2)" }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-semibold">Client dinner — Tokyo</div>
            <div className="text-[10px]" style={{ color: "var(--lm-muted)" }}>Travel & entertainment</div>
          </div>
          <div className="text-right">
            <div className="lm-mono font-bold" style={{ color: "var(--lm-accent)" }}>S$432.10</div>
            <div className="text-[10px]" style={{ color: "var(--lm-muted)" }}>¥48,000 → SGD</div>
          </div>
        </div>
        <div className="mt-4 flex items-center">
          {steps.map((s, i) => (
            <React.Fragment key={s.l}>
              <div className="flex flex-col items-center gap-1">
                <span
                  className="grid h-6 w-6 place-items-center rounded-full text-[11px]"
                  style={{
                    background: s.done ? "var(--lm-finance)" : "#fff",
                    color: s.done ? "#fff" : "var(--lm-muted)",
                    border: s.done ? "none" : "1.5px dashed var(--lm-line-2)",
                  }}
                >
                  {s.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className="text-[9px]" style={{ color: s.done ? "var(--lm-ink)" : "var(--lm-muted)" }}>{s.l}</span>
              </div>
              {i < steps.length - 1 && (
                <div className="mx-1 mb-4 h-0.5 flex-1 rounded" style={{ background: steps[i + 1].done ? "var(--lm-finance)" : "var(--lm-line)" }} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
      <p className="mt-2.5 text-[11px]" style={{ color: "var(--lm-muted)" }}>
        Approved by Priya Nair · pays out with July payroll
      </p>
    </div>
  );
}

// ── Performance (weighted appraisal + 360) ──────────────────────────────────
export function PerformanceScreen() {
  const objectives = [
    { l: "Ship design system v2", w: "40%", score: 4.5 },
    { l: "Cut onboarding time 30%", w: "30%", score: 4.0 },
  ];
  const competencies = [
    { l: "Collaboration", score: 4.6 },
    { l: "Craft", score: 4.2 },
  ];
  const bar = (score: number, hue: string) => (
    <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--lm-paper-2)" }}>
      <div className="h-full rounded-full" style={{ width: `${(score / 5) * 100}%`, background: hue }} />
    </div>
  );
  return (
    <div className="p-4 text-[12px]" style={{ color: "var(--lm-ink)" }}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="font-semibold">H2 2026 appraisal · Wei Ling Tan</div>
          <div className="text-[10px]" style={{ color: "var(--lm-muted)" }}>Objectives 70% · Competencies 30%</div>
        </div>
        <span className="lm-mono rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white" style={{ background: "var(--lm-accent)" }}>4.4</span>
      </div>
      <div className="flex flex-col gap-2">
        <div className="p-3" style={screenCard}>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--lm-muted)" }}>Objectives · 70%</div>
          {objectives.map((o) => (
            <div key={o.l} className="flex items-center gap-2 py-1">
              <span className="w-40 truncate">{o.l}</span>
              <span className="lm-mono text-[10px]" style={{ color: "var(--lm-muted)" }}>{o.w}</span>
              {bar(o.score, "var(--lm-accent)")}
              <span className="lm-mono w-7 text-right font-semibold">{o.score.toFixed(1)}</span>
            </div>
          ))}
        </div>
        <div className="p-3" style={screenCard}>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--lm-muted)" }}>Competencies · 30%</div>
          {competencies.map((c) => (
            <div key={c.l} className="flex items-center gap-2 py-1">
              <span className="w-40 truncate">{c.l}</span>
              <span className="lm-mono text-[10px]" style={{ color: "var(--lm-muted)" }}>—</span>
              {bar(c.score, "var(--lm-finance)")}
              <span className="lm-mono w-7 text-right font-semibold">{c.score.toFixed(1)}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between rounded-lg px-3 py-2" style={{ ...screenCard, background: "var(--lm-panel-2)" }}>
          <span>360° feedback · 6 responses</span>
          <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "color-mix(in oklab, var(--lm-sales) 14%, #fff)", color: "var(--lm-sales)" }}>
            Anonymous
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Recruitment (pipeline + public board) ───────────────────────────────────
export function RecruitmentScreen() {
  const cols = [
    { l: "Applied", n: 12, people: ["Grace Lim", "Ethan Ong"] },
    { l: "Interview", n: 4, people: ["Farah Aziz"] },
    { l: "Offer", n: 1, people: ["Jon Teo"] },
  ];
  return (
    <div className="p-4 text-[12px]" style={{ color: "var(--lm-ink)" }}>
      <div className="mb-3 flex items-center justify-between">
        <div className="font-semibold">Product Engineer · Full-time</div>
        <span className="lm-mono flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px]" style={{ background: "color-mix(in oklab, var(--lm-finance) 12%, #fff)", color: "var(--lm-finance)" }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--lm-finance)" }} />
          boards/acme · live
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {cols.map((c) => (
          <div key={c.l} className="rounded-lg p-2" style={{ background: "var(--lm-panel-2)", border: "1px solid var(--lm-line)" }}>
            <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--lm-muted)" }}>
              {c.l}
              <span className="lm-mono">{c.n}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {c.people.map((p) => (
                <div key={p} className="flex items-center gap-1.5 rounded-md px-1.5 py-1.5" style={{ background: "#fff", border: "1px solid var(--lm-line)" }}>
                  <Avatar name={p} hue="var(--lm-sales)" />
                  <span className="truncate text-[11px] font-medium">{p}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-2.5 text-[11px]" style={{ color: "var(--lm-muted)" }}>
        Candidates apply on your public board — no login needed.
      </p>
    </div>
  );
}

// ── Reports (statistics + exporter) ─────────────────────────────────────────
export function ReportsScreen() {
  const bars = [42, 55, 48, 62, 70, 66];
  return (
    <div className="grid gap-3 p-4 text-[12px] sm:grid-cols-[1.15fr_0.85fr]" style={{ color: "var(--lm-ink)" }}>
      <div className="p-3" style={screenCard}>
        <div className="mb-2 flex items-center justify-between">
          <span className="font-semibold">Headcount</span>
          <span className="lm-mono text-[10px]" style={{ color: "var(--lm-finance)" }}>+9.4% YTD</span>
        </div>
        <div className="flex h-24 items-end gap-1.5">
          {bars.map((h, i) => (
            <div key={i} className="flex-1 rounded-t-[3px]" style={{ height: `${h}%`, background: i === bars.length - 1 ? "var(--lm-accent)" : "color-mix(in oklab, var(--lm-accent) 30%, #fff)" }} />
          ))}
        </div>
        <div className="lm-mono mt-1.5 flex justify-between text-[9px]" style={{ color: "var(--lm-muted-2)" }}>
          <span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {[
          { l: "Attrition", v: "3.1%" },
          { l: "Leave taken", v: "412 d" },
          { l: "Payroll cost", v: "S$182k" },
        ].map((s) => (
          <div key={s.l} className="flex items-center justify-between rounded-lg px-3 py-2" style={screenCard}>
            <span style={{ color: "var(--lm-muted)" }}>{s.l}</span>
            <span className="lm-mono font-semibold">{s.v}</span>
          </div>
        ))}
        <button className="lm-mono mt-auto flex items-center justify-center gap-1 rounded-lg py-2 text-[11px] font-semibold text-white" style={{ background: "var(--lm-accent)" }}>
          Export CSV / Excel <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── 6. Attendance (rotating QR + GPS) ───────────────────────────────────────
export function AttendanceScreen() {
  // A decorative QR-like grid.
  const cells = Array.from({ length: 49 }, (_, i) => (i * 7 + 3) % 5 < 2);
  return (
    <div className="grid gap-3 p-4 text-[12px] sm:grid-cols-[auto_1fr]" style={{ color: "var(--lm-ink)" }}>
      <div className="flex flex-col items-center gap-2 rounded-xl p-3" style={{ ...screenCard, background: "var(--lm-panel-2)" }}>
        <div className="relative grid grid-cols-7 gap-[3px] rounded-lg bg-white p-2" style={{ border: "1px solid var(--lm-line)" }}>
          {cells.map((on, i) => (
            <span key={i} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: on ? "var(--lm-ink)" : "transparent" }} />
          ))}
          <span className="pointer-events-none absolute inset-x-2 top-2 h-0.5 rounded" style={{ background: "var(--lm-accent)", animation: "lm-bob 2.4s ease-in-out infinite" }} />
        </div>
        <div className="flex items-center gap-1 text-[10px]" style={{ color: "var(--lm-muted)" }}>
          <QrCode className="h-3 w-3" /> refreshes every 30s
        </div>
      </div>
      <div className="flex flex-col justify-center gap-2">
        <div className="flex items-center justify-between rounded-lg px-3 py-2" style={screenCard}>
          <span className="font-medium">Clocked in</span>
          <span className="lm-mono font-semibold" style={{ color: "var(--lm-finance)" }}>09:02 AM</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px]" style={{ ...screenCard, color: "var(--lm-muted)" }}>
          <MapPin className="h-3.5 w-3.5" style={{ color: "var(--lm-accent)" }} />
          Marina Bay office · within range
        </div>
        <button className="lm-mono flex items-center justify-center gap-1 rounded-lg py-2 text-[11px] font-semibold text-white" style={{ background: "var(--lm-accent)" }}>
          Clock out <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
