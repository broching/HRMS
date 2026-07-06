import { Reveal } from "./reveal";

// Shared section header: a mono eyebrow + a display headline + optional lede.
export function SectionHeading({
  eyebrow,
  title,
  lede,
  align = "left",
}: {
  eyebrow: string;
  title: React.ReactNode;
  lede?: React.ReactNode;
  align?: "left" | "center";
}) {
  const center = align === "center";
  return (
    <div className={center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <Reveal>
        <div
          className={`inline-flex items-center gap-2.5 ${center ? "justify-center" : ""}`}
        >
          <span
            className="h-px w-8"
            style={{ background: "var(--lm-accent)" }}
            aria-hidden
          />
          <span className="lm-eyebrow">{eyebrow}</span>
        </div>
      </Reveal>
      <Reveal delay={80}>
        <h2 className="lm-display mt-4 text-[clamp(2rem,4.4vw,3.2rem)]">{title}</h2>
      </Reveal>
      {lede && (
        <Reveal delay={140}>
          <p
            className={`mt-4 text-[1.05rem] leading-relaxed ${center ? "mx-auto" : ""}`}
            style={{ color: "var(--lm-muted)" }}
          >
            {lede}
          </p>
        </Reveal>
      )}
    </div>
  );
}
