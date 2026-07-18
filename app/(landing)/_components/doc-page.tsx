import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LandingNav } from "./landing-nav";
import { SiteFooter } from "./site-footer";

// A block of policy/legal prose. Kept as structured data so every document
// renders with identical, deliberate typography.
export type DocBlock =
  | { type: "p"; text: string }
  | { type: "h"; text: string }
  | { type: "list"; items: string[] };

export type DocSection = { id: string; title: string; blocks: DocBlock[] };

function Blocks({ blocks }: { blocks: DocBlock[] }) {
  return (
    <div className="flex flex-col gap-4">
      {blocks.map((b, i) => {
        if (b.type === "h")
          return (
            <h3
              key={i}
              className="mt-2 text-[0.95rem] font-semibold"
              style={{ color: "var(--lm-ink)" }}
            >
              {b.text}
            </h3>
          );
        if (b.type === "list")
          return (
            <ul key={i} className="flex flex-col gap-2 pl-1">
              {b.items.map((it, j) => (
                <li key={j} className="flex gap-2.5 text-[0.96rem] leading-relaxed">
                  <span
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: "var(--lm-accent)" }}
                    aria-hidden
                  />
                  <span style={{ color: "var(--lm-muted)" }}>{it}</span>
                </li>
              ))}
            </ul>
          );
        return (
          <p
            key={i}
            className="text-[0.96rem] leading-relaxed"
            style={{ color: "var(--lm-muted)" }}
          >
            {b.text}
          </p>
        );
      })}
    </div>
  );
}

/**
 * Shared layout for a legal / policy document: a blueprint header band over a
 * paper reading surface with a sticky numbered clause index. Clauses ARE an
 * ordered reference, so the numbering carries real meaning.
 */
export function DocPage({
  eyebrow,
  title,
  intro,
  updated,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  updated: string;
  sections: DocSection[];
}) {
  return (
    <main>
      <LandingNav />

      {/* Header — the printed blueprint */}
      <div className="lm-blueprint">
        <header className="mx-auto max-w-4xl px-5 pt-32 pb-14 md:pt-40 md:pb-20">
          <Link
            href="/"
            className="lm-mono inline-flex items-center gap-1.5 text-xs transition-colors"
            style={{ color: "var(--lm-muted)" }}
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to LeadMighty
          </Link>
          <p className="lm-eyebrow mt-8" style={{ color: "var(--lm-accent)" }}>
            {eyebrow}
          </p>
          <h1 className="lm-display mt-3 text-[clamp(2.2rem,5.5vw,3.6rem)]">
            {title}
          </h1>
          <p
            className="mt-4 max-w-2xl text-[1.05rem] leading-relaxed"
            style={{ color: "var(--lm-ink-2)" }}
          >
            {intro}
          </p>
          <p className="lm-mono mt-7 text-xs" style={{ color: "var(--lm-muted-2)" }}>
            Last updated · {updated}
          </p>
        </header>
      </div>

      {/* Body — the drafting sheet */}
      <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <div className="grid gap-10 md:grid-cols-[230px_1fr] md:gap-16">
          {/* Clause index */}
          <nav
            aria-label="Contents"
            className="h-fit md:sticky md:top-28 md:self-start"
          >
            <p className="lm-eyebrow mb-4">On this page</p>
            <ol className="flex flex-col gap-2.5">
              {sections.map((s, i) => (
                <li key={s.id} className="flex gap-2.5 text-sm">
                  <span
                    className="lm-mono text-xs tabular-nums"
                    style={{ color: "var(--lm-muted-2)" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <a
                    href={`#${s.id}`}
                    className="transition-colors hover:underline"
                    style={{ color: "var(--lm-muted)" }}
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {/* Clauses */}
          <div className="flex flex-col gap-12">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className="scroll-mt-28">
                <div className="flex items-baseline gap-3">
                  <span
                    className="lm-mono text-sm tabular-nums"
                    style={{ color: "var(--lm-accent)" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h2 className="lm-display text-[clamp(1.3rem,2.4vw,1.6rem)]">
                    {s.title}
                  </h2>
                </div>
                <div className="mt-4 md:pl-9">
                  <Blocks blocks={s.blocks} />
                </div>
              </section>
            ))}

            <p
              className="lm-mono border-t pt-6 text-xs leading-relaxed"
              style={{ borderColor: "var(--lm-line)", color: "var(--lm-muted-2)" }}
            >
              Questions about this document? Email{" "}
              <a
                href="mailto:legal@leadmighty.com"
                style={{ color: "var(--lm-accent)" }}
              >
                legal@leadmighty.com
              </a>
              .
            </p>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
