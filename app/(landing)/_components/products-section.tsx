"use client";

import Link from "next/link";
import { ArrowRight, Bell } from "lucide-react";
import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";
import { PRODUCTS, STATUS_LABEL, type Product } from "./products";

// Preselect a product in the contact form, then scroll to it. Decoupled via a
// window event so the two components never import each other.
function requestContact(productName: string) {
  window.dispatchEvent(new CustomEvent("lm-select-product", { detail: productName }));
  document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" });
}

// ── Per-product mini-glyph: a small line drawing of what the product does. ───
function ProductGlyph({ code, hue }: { code: string; hue: string }) {
  const common = { stroke: hue, strokeWidth: 1.8, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (code) {
    case "LM·HR": // org nodes
      return (
        <svg viewBox="0 0 72 48" className="h-12 w-[72px]">
          <line x1="36" y1="14" x2="18" y2="32" {...common} />
          <line x1="36" y1="14" x2="54" y2="32" {...common} />
          <circle cx="36" cy="12" r="5" {...common} />
          <circle cx="18" cy="34" r="5" {...common} />
          <circle cx="54" cy="34" r="5" {...common} />
        </svg>
      );
    case "LM·CRM": // rising pipeline bars
      return (
        <svg viewBox="0 0 72 48" className="h-12 w-[72px]">
          <line x1="16" y1="38" x2="16" y2="30" {...common} />
          <line x1="30" y1="38" x2="30" y2="24" {...common} />
          <line x1="44" y1="38" x2="44" y2="17" {...common} />
          <line x1="58" y1="38" x2="58" y2="10" {...common} />
          <path d="M12 40 H62" {...common} />
        </svg>
      );
    case "LM·FIN": // ledger / balance
      return (
        <svg viewBox="0 0 72 48" className="h-12 w-[72px]">
          <path d="M36 10 V38" {...common} />
          <path d="M22 18 H50" {...common} />
          <path d="M22 18 L16 28 H28 Z" {...common} />
          <path d="M50 18 L44 28 H56 Z" {...common} />
          <path d="M28 40 H44" {...common} />
        </svg>
      );
    default: // LM·DESK — chat bubbles
      return (
        <svg viewBox="0 0 72 48" className="h-12 w-[72px]">
          <path d="M14 12 H44 A4 4 0 0 1 48 16 V26 A4 4 0 0 1 44 30 H24 L16 37 V30 H14 A4 4 0 0 1 10 26 V16 A4 4 0 0 1 14 12 Z" {...common} />
          <path d="M52 22 H58 A4 4 0 0 1 62 26 V32 A4 4 0 0 1 58 36 H56 V40 L50 36" {...common} opacity={0.55} />
        </svg>
      );
  }
}

function ProductPlate({ p, i }: { p: Product; i: number }) {
  const live = p.status === "live";
  return (
    <Reveal delay={i * 90} className="h-full">
      <article
        className="group relative flex h-full flex-col rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1.5"
        style={{
          background: "var(--lm-panel)",
          border: `1px solid ${live ? `color-mix(in oklab, ${p.hue} 45%, var(--lm-line))` : "var(--lm-line)"}`,
          boxShadow: "var(--lm-shadow)",
        }}
      >
        {/* node where the spine rail meets the card */}
        <span
          className="absolute -top-[7px] left-6 hidden h-3 w-3 rounded-full lg:block"
          style={{ background: p.hue, boxShadow: "0 0 0 4px var(--lm-paper)" }}
          aria-hidden
        />

        <div className="flex items-center justify-between">
          <span className="lm-mono text-[11px]" style={{ letterSpacing: "0.16em", color: p.hue }}>
            {p.code}
          </span>
          <span
            className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
            style={{
              color: live ? "#fff" : p.hue,
              background: live ? p.hue : `color-mix(in oklab, ${p.hue} 10%, transparent)`,
              border: live ? "none" : `1px solid color-mix(in oklab, ${p.hue} 28%, transparent)`,
            }}
          >
            {STATUS_LABEL[p.status]}
          </span>
        </div>

        <div
          className="mt-4 grid place-items-center rounded-xl py-4 transition-colors duration-300"
          style={{ background: `color-mix(in oklab, ${p.hue} 6%, var(--lm-panel-2))` }}
        >
          <div className="transition-transform duration-500 group-hover:scale-110">
            <ProductGlyph code={p.code} hue={p.hue} />
          </div>
        </div>

        <h3 className="lm-display mt-4 text-xl">{p.name}</h3>
        <p className="mt-1 text-sm leading-snug" style={{ color: "var(--lm-muted)" }}>
          {p.kicker}
        </p>

        <div className="mt-4 flex-1" />
        {live ? (
          <Link
            href="/leadmightyhr"
            className="inline-flex items-center gap-1.5 text-sm font-semibold"
            style={{ color: p.hue }}
          >
            Tour it <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => requestContact(p.name)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold"
            style={{ color: "var(--lm-muted)" }}
          >
            <Bell className="h-4 w-4" /> Tell me when it&apos;s ready
          </button>
        )}
      </article>
    </Reveal>
  );
}

export function ProductsSection() {
  return (
    <section id="products" className="scroll-mt-24 py-24 md:py-32">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading
          eyebrow="The suite"
          title={
            <>
              Four products.
              <br />
              <span className="lm-spectrum-text">One foundation.</span>
            </>
          }
          lede="One is live and doing real work today. Three are on the drawing board — each sharing the same spine, so growing into the suite never means another migration."
        />

        <div className="relative mt-16">
          {/* the spine rail the plates hang from (desktop) */}
          <div
            className="absolute left-0 right-0 top-0 hidden h-px lg:block"
            style={{ background: "linear-gradient(90deg, transparent, var(--lm-line-2) 8%, var(--lm-line-2) 92%, transparent)" }}
            aria-hidden
          />
          <div className="grid gap-5 pt-px sm:grid-cols-2 lg:grid-cols-4">
            {PRODUCTS.map((p, i) => (
              <ProductPlate key={p.code} p={p} i={i} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
