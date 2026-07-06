import { Fingerprint, Building2, ShieldCheck, Receipt } from "lucide-react";
import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";
import { PRODUCTS } from "./products";

// The "one shared spine" thesis: every LeadMighty product plugs into the same
// identity / org / permissions / billing core, so data compounds instead of
// fragmenting across tools.
const SPINE = [
  { icon: Fingerprint, label: "Identity", note: "One login, everywhere" },
  { icon: Building2, label: "Org graph", note: "People, teams, offices" },
  { icon: ShieldCheck, label: "Permissions", note: "Role-based, granular" },
  { icon: Receipt, label: "Billing", note: "One account, one invoice" },
];

export function PlatformSection() {
  return (
    <section id="platform" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-24 md:py-32">
      <SectionHeading
        eyebrow="The platform"
        title={
          <>
            Not another tool to bolt on.
            <br />A <span className="lm-accent-text">spine</span> your business grows around.
          </>
        }
        lede="Most companies run on a dozen disconnected apps that each hold a slice of the truth. LeadMighty products share one spine — the same people, orgs, permissions and billing — so every product you add makes the others smarter."
      />

      {/* Spine diagram */}
      <Reveal delay={120}>
        <div className="mt-14 lm-card overflow-hidden p-6 md:p-10">
          {/* products row */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {PRODUCTS.map((p) => (
              <div
                key={p.code}
                className="rounded-xl px-4 py-3.5 text-center"
                style={{
                  background: `color-mix(in oklab, ${p.hue} 7%, var(--lm-panel))`,
                  border: `1px solid color-mix(in oklab, ${p.hue} 30%, var(--lm-line))`,
                }}
              >
                <div className="lm-mono text-[10px]" style={{ letterSpacing: "0.14em", color: p.hue }}>
                  {p.code}
                </div>
                <div className="lm-display mt-1 text-sm">{p.name.replace("LeadMighty", "")}</div>
              </div>
            ))}
          </div>

          {/* connectors */}
          <div className="relative mx-auto my-4 h-8 w-full" aria-hidden>
            <div
              className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2"
              style={{ background: "linear-gradient(var(--lm-line-2), transparent)" }}
            />
            <div
              className="absolute left-[12.5%] right-[12.5%] top-1/2 h-px"
              style={{ background: "var(--lm-line-2)" }}
            />
          </div>

          {/* the shared spine */}
          <div
            className="rounded-xl px-5 py-4"
            style={{
              background:
                "linear-gradient(90deg, color-mix(in oklab, var(--lm-accent) 12%, var(--lm-panel-2)), var(--lm-panel-2))",
              border: "1px solid color-mix(in oklab, var(--lm-accent) 30%, var(--lm-line))",
            }}
          >
            <div className="mb-4 flex items-center gap-2">
              <span className="lm-mono text-[10px]" style={{ letterSpacing: "0.18em", color: "var(--lm-accent)" }}>
                THE LEADMIGHTY SPINE
              </span>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {SPINE.map((s) => (
                <div key={s.label} className="flex items-start gap-2.5">
                  <s.icon className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--lm-accent)" }} />
                  <div>
                    <div className="lm-display text-sm">{s.label}</div>
                    <div className="text-xs" style={{ color: "var(--lm-muted)" }}>
                      {s.note}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
