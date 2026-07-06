import { Reveal } from "./reveal";

// A signed note from the team — the one place the page speaks in a plain human
// voice rather than product copy. Honest about being small and early, which is
// the point. Styled like a leaf torn from the drafting notebook.
export function TeamNote() {
  return (
    <section className="mx-auto max-w-4xl px-5 py-20 md:py-24">
      <Reveal>
        <div
          className="relative mx-auto max-w-2xl rounded-2xl p-8 md:p-11"
          style={{
            background: "var(--lm-panel)",
            border: "1px solid var(--lm-line)",
            boxShadow: "var(--lm-shadow-lg)",
          }}
        >
          {/* punched-hole margin, like notebook paper */}
          <div className="pointer-events-none absolute inset-y-8 left-5 hidden flex-col justify-between md:flex" aria-hidden>
            {Array.from({ length: 4 }).map((_, i) => (
              <span
                key={i}
                className="h-2 w-2 rounded-full"
                style={{ background: "var(--lm-paper)", boxShadow: "inset 0 0 0 1px var(--lm-line-2)" }}
              />
            ))}
          </div>

          <p className="lm-eyebrow" style={{ color: "var(--lm-accent)" }}>
            A note from the team
          </p>

          <div className="mt-5 space-y-4 text-[1.06rem] leading-relaxed md:pl-4" style={{ color: "var(--lm-ink-2)" }}>
            <p>
              We started LeadMighty because we were tired of watching good teams drown in a
              dozen half-connected tools — one for leave, another for payroll, a spreadsheet
              for everything in between.
            </p>
            <p>
              So we&apos;re building the opposite: a suite that shares one foundation, drawn
              carefully, one product at a time. <strong style={{ color: "var(--lm-ink)" }}>LeadMightyHR
              is live and in real use.</strong> The rest is on the board, and we&apos;d rather
              tell you that honestly than pretend it&apos;s all shipping tomorrow.
            </p>
            <p>
              We&apos;re a small team in Singapore. If you try it and something feels off,
              you&apos;ll reach actual people who can fix it.
            </p>
          </div>

          <div className="mt-7 md:pl-4">
            <span className="lm-hand block text-[2rem] leading-none" style={{ color: "var(--lm-accent)" }}>
              The LeadMighty team
            </span>
            <span className="lm-mono mt-2 block text-[11px]" style={{ letterSpacing: "0.14em", color: "var(--lm-muted)" }}>
              SINGAPORE · BUILDING IN THE OPEN
            </span>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
