// An honest stand-in for a logo wall (no invented customer marks): a marquee of
// the kinds of teams LeadMighty is built for.
const AUDIENCES = [
  "Startups",
  "SMEs",
  "Agencies",
  "Retail & F&B",
  "Clinics",
  "Logistics",
  "Professional services",
  "Manufacturing",
  "Non-profits",
  "Franchises",
];

export function LogoStrip() {
  const items = [...AUDIENCES, ...AUDIENCES];
  return (
    <section className="relative border-y py-7" style={{ borderColor: "var(--lm-line)" }}>
      <p className="lm-eyebrow mb-5 text-center">Built for teams across —</p>
      <div
        className="relative overflow-hidden"
        style={{
          maskImage: "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)",
          WebkitMaskImage: "linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)",
        }}
      >
        <div className="lm-marquee-track gap-10 pr-10">
          {items.map((a, i) => (
            <span
              key={i}
              className="lm-display whitespace-nowrap text-lg"
              style={{ color: "var(--lm-muted)", fontWeight: 600 }}
            >
              {a}
              <span className="ml-10" style={{ color: "var(--lm-accent)" }}>
                ✦
              </span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
