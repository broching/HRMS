import { Layers, MapPin, Zap } from "lucide-react";
import { Reveal } from "./reveal";

// Why LeadMighty — three convictions, stated plainly. Not a sequence, so no
// numbered markers: each stands on its own.
const PRINCIPLES = [
  {
    icon: Layers,
    title: "One spine, not one more silo",
    body: "Every product reads and writes the same people, orgs and permissions. Add a product and your existing data instantly makes it useful — no imports, no re-keying.",
  },
  {
    icon: MapPin,
    title: "Singapore-first, globally minded",
    body: "CPF-ready payroll, local compliance defaults and multi-currency claims out of the box — with the room to grow into new markets as you do.",
  },
  {
    icon: Zap,
    title: "Real-time by default",
    body: "Approvals, balances and dashboards update live across every device the moment something changes. What you see is always the current truth.",
  },
];

export function PrinciplesSection() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-24 md:py-28">
      <Reveal>
        <p className="lm-display mx-auto max-w-4xl text-center text-[clamp(1.5rem,3.4vw,2.4rem)] leading-tight">
          A few things we&apos;re stubborn about.{" "}
          <span style={{ color: "var(--lm-muted)" }}>
            They shape every decision we make about what to build next.
          </span>
        </p>
      </Reveal>

      <div className="mt-16 grid gap-5 md:grid-cols-3">
        {PRINCIPLES.map((p, i) => (
          <Reveal key={p.title} delay={i * 100}>
            <div
              className="h-full rounded-2xl p-6"
              style={{ background: "var(--lm-panel)", border: "1px solid var(--lm-line)" }}
            >
              <div
                className="grid h-11 w-11 place-items-center rounded-xl"
                style={{
                  background: "color-mix(in oklab, var(--lm-accent) 14%, transparent)",
                  border: "1px solid color-mix(in oklab, var(--lm-accent) 28%, transparent)",
                }}
              >
                <p.icon className="h-5 w-5" style={{ color: "var(--lm-accent)" }} />
              </div>
              <h3 className="lm-display mt-4 text-xl">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--lm-muted)" }}>
                {p.body}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
