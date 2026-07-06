"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, MoveRight } from "lucide-react";
import { PRODUCTS, STATUS_LABEL } from "./products";

// ── Schematic geometry (viewBox 0 0 560 452) ────────────────────────────────
// A central "spine" bar with four product plates drafted onto its right side.
const SPINE = { x: 214, y: 92, w: 78, h: 300 };
const PLATE = { x: 372, w: 176, h: 60 };
const plateY = (i: number) => 84 + i * 84;
const plateCy = (i: number) => plateY(i) + PLATE.h / 2;

const CORE = ["Identity", "Org graph", "Permissions", "Billing"];

export function BlueprintHero() {
  const [active, setActive] = React.useState(0);
  const sectionRef = React.useRef<HTMLElement>(null);
  const product = PRODUCTS[active];

  // Recolor the whole surface to the highlighted product's hue.
  React.useEffect(() => {
    const root = sectionRef.current?.closest(".lm-root") as HTMLElement | null;
    if (!root) return;
    root.style.setProperty("--lm-accent", product.hue);
    root.style.setProperty("--lm-accent-2", product.hue2);
  }, [product]);

  return (
    <section
      ref={sectionRef}
      className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-32 md:min-h-[92vh] md:grid-cols-[1.02fr_1fr] md:gap-8 md:pb-24 md:pt-36"
    >
      {/* ── Left: the thesis ───────────────────────────────────────────────── */}
      <div>
        <div
          className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
          style={{ border: "1px solid var(--lm-line-2)", background: "var(--lm-panel)", boxShadow: "var(--lm-shadow)" }}
        >
          <span className="relative flex h-2 w-2">
            <span
              className="absolute inline-flex h-full w-full rounded-full"
              style={{ background: "var(--lm-accent)", animation: "lm-ping 2.4s ease-out infinite" }}
            />
            <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: "var(--lm-accent)" }} />
          </span>
          <span className="lm-eyebrow" style={{ letterSpacing: "0.16em" }}>
            B2B software, drafted in Singapore
          </span>
        </div>

        <h1 className="lm-display mt-6 text-[clamp(2.5rem,6.2vw,4.4rem)]">
          The software your
          <br />
          business runs on,
          <br />
          <span className="lm-spectrum-text">drawn to fit.</span>
        </h1>

        <p className="mt-6 max-w-xl text-[1.06rem] leading-relaxed" style={{ color: "var(--lm-ink-2)" }}>
          We&apos;re LeadMighty — a small team building a suite of business tools on one
          shared foundation, so your people, money and customers finally live in the same
          place. It starts with{" "}
          <span className="lm-accent-text font-semibold">LeadMightyHR</span>, which teams use
          today.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link href="/leadmightyhr" className="lm-btn lm-btn-primary">
            Tour LeadMightyHR <ArrowRight className="h-4 w-4" />
          </Link>
          <a href="#products" className="lm-btn lm-btn-ghost">
            See what&apos;s coming
          </a>
        </div>

        {/* Live spec readout — updates as you point at a product plate. */}
        <div
          className="mt-10 max-w-md overflow-hidden rounded-xl"
          style={{ border: "1px solid var(--lm-line-2)", background: "var(--lm-panel)", boxShadow: "var(--lm-shadow)" }}
        >
          <div
            className="flex items-center justify-between px-4 py-2"
            style={{ borderBottom: "1px solid var(--lm-line)", background: "var(--lm-panel-2)" }}
          >
            <span className="lm-mono text-[11px]" style={{ letterSpacing: "0.14em", color: product.hue }}>
              {product.code}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{
                color: product.status === "live" ? "#fff" : product.hue,
                background:
                  product.status === "live" ? product.hue : `color-mix(in oklab, ${product.hue} 12%, transparent)`,
                border: product.status === "live" ? "none" : `1px solid color-mix(in oklab, ${product.hue} 30%, transparent)`,
              }}
            >
              {STATUS_LABEL[product.status]}
            </span>
          </div>
          <div className="px-4 py-3">
            <div className="lm-display text-lg">{product.name}</div>
            <p className="mt-0.5 text-sm" style={{ color: "var(--lm-muted)" }}>
              {product.kicker}
              <span aria-hidden className="lm-accent-text" style={{ animation: "lm-caret 1.1s step-end infinite" }}>
                {" "}▍
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* ── Right: the self-drawing schematic ──────────────────────────────── */}
      <div className="relative">
        <svg
          viewBox="0 0 560 452"
          className="w-full"
          role="group"
          aria-label="LeadMighty platform schematic — choose a product to inspect it"
        >
          {/* drawing border + corner ticks */}
          <rect x="8" y="8" width="544" height="436" rx="8" fill="none" stroke="var(--lm-line-2)" strokeWidth="1" strokeDasharray="2 6" />
          {[
            [8, 8],
            [552, 8],
            [8, 444],
            [552, 444],
          ].map(([cx, cy], i) => (
            <g key={i} stroke="var(--lm-line-2)" strokeWidth="1">
              <line x1={cx - 7} y1={cy} x2={cx + 7} y2={cy} />
              <line x1={cx} y1={cy - 7} x2={cx} y2={cy + 7} />
            </g>
          ))}

          {/* incoming: your company data → spine */}
          <g>
            <line
              x1="40" y1="242" x2={SPINE.x} y2="242"
              stroke="var(--lm-ink)" strokeWidth="1.5" pathLength={1}
              className="lm-ink-draw" style={{ animationDelay: "80ms" }}
            />
            <circle cx="40" cy="242" r="3" fill="var(--lm-ink)" />
            <text x="44" y="230" className="lm-mono" fontSize="9.5" letterSpacing="1.5" fill="var(--lm-muted)">
              YOUR COMPANY
            </text>
          </g>

          {/* the spine */}
          <rect
            x={SPINE.x} y={SPINE.y} width={SPINE.w} height={SPINE.h} rx="10"
            fill="color-mix(in oklab, var(--lm-accent) 8%, var(--lm-panel))"
            stroke="var(--lm-accent)" strokeWidth="1.6" pathLength={1}
            className="lm-ink-draw" style={{ animationDelay: "180ms" }}
          />
          <text
            x={SPINE.x + SPINE.w / 2} y={SPINE.y + 22} textAnchor="middle"
            className="lm-mono" fontSize="9.5" letterSpacing="1.4" fill="var(--lm-accent)"
          >
            SPINE
          </text>
          {CORE.map((c, i) => (
            <g key={c} style={{ animation: "lm-fade-up 500ms ease both", animationDelay: `${520 + i * 90}ms` }}>
              <circle cx={SPINE.x + 16} cy={SPINE.y + 58 + i * 56} r="2.6" fill="var(--lm-accent)" />
              <text
                x={SPINE.x + 26} y={SPINE.y + 62 + i * 56}
                fontSize="11.5" fill="var(--lm-ink-2)" fontWeight="500"
                style={{ fontFamily: "var(--font-sans), system-ui" }}
              >
                {c}
              </text>
            </g>
          ))}

          {/* dimension line down the spine (drafting detail) */}
          <g stroke="var(--lm-line-2)" strokeWidth="1">
            <line x1={SPINE.x - 14} y1={SPINE.y} x2={SPINE.x - 14} y2={SPINE.y + SPINE.h} />
            <line x1={SPINE.x - 18} y1={SPINE.y} x2={SPINE.x - 10} y2={SPINE.y} />
            <line x1={SPINE.x - 18} y1={SPINE.y + SPINE.h} x2={SPINE.x - 10} y2={SPINE.y + SPINE.h} />
          </g>

          {/* connectors + product plates */}
          {PRODUCTS.map((p, i) => {
            const isActive = i === active;
            const cy = plateCy(i);
            return (
              <g key={p.code}>
                {/* elbow connector: spine → plate */}
                <path
                  d={`M${SPINE.x + SPINE.w} 242 H${(SPINE.x + SPINE.w + PLATE.x) / 2} V${cy} H${PLATE.x}`}
                  fill="none"
                  stroke={isActive ? p.hue : "var(--lm-line-2)"}
                  strokeWidth={isActive ? 2 : 1.2}
                  strokeLinejoin="round"
                  pathLength={1}
                  className="lm-ink-draw"
                  style={{
                    animationDelay: `${640 + i * 130}ms`,
                    strokeDasharray: isActive ? "6 8" : undefined,
                    animation: isActive ? "lm-beam-flow 1.2s linear infinite" : undefined,
                    transition: "stroke 300ms ease, stroke-width 300ms ease",
                  }}
                />
                <circle cx={PLATE.x} cy={cy} r={isActive ? 4 : 2.6} fill={isActive ? p.hue : "var(--lm-line-2)"} />

                {/* plate as an interactive HTML button */}
                <foreignObject
                  x={PLATE.x + 8}
                  y={plateY(i)}
                  width={PLATE.w}
                  height={PLATE.h}
                  style={{ animation: "lm-fade-up 500ms ease both", animationDelay: `${700 + i * 130}ms` }}
                >
                  <button
                    type="button"
                    aria-pressed={isActive}
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onClick={() => setActive(i)}
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      gap: 3,
                      textAlign: "left",
                      padding: "0 12px",
                      borderRadius: 11,
                      cursor: "pointer",
                      background: isActive ? `color-mix(in oklab, ${p.hue} 9%, #fff)` : "var(--lm-panel)",
                      border: `1.5px solid ${isActive ? p.hue : "var(--lm-line)"}`,
                      boxShadow: isActive ? `0 10px 22px -12px ${p.hue}` : "var(--lm-shadow)",
                      transform: isActive ? "translateY(-1px)" : "none",
                      transition: "all 260ms cubic-bezier(0.22,1,0.36,1)",
                    }}
                  >
                    <span className="lm-mono" style={{ fontSize: 9.5, letterSpacing: "0.14em", color: p.hue }}>
                      {p.code}
                    </span>
                    <span className="lm-display" style={{ fontSize: 15, lineHeight: 1, color: "var(--lm-ink)" }}>
                      {p.name.replace("LeadMighty", "LM ")}
                    </span>
                  </button>
                </foreignObject>
              </g>
            );
          })}

          {/* title block (drafting convention) */}
          <g style={{ animation: "lm-fade-up 500ms ease both", animationDelay: "1200ms" }}>
            <rect x="360" y="404" width="184" height="30" rx="4" fill="var(--lm-panel-2)" stroke="var(--lm-line)" strokeWidth="1" />
            <text x="370" y="416" className="lm-mono" fontSize="8" letterSpacing="1.2" fill="var(--lm-muted)">
              LEADMIGHTY / PLATFORM
            </text>
            <text x="370" y="427" className="lm-mono" fontSize="8" letterSpacing="1.2" fill="var(--lm-muted-2)">
              SCHEMATIC · REV 2026.07
            </text>
          </g>
        </svg>

        <p className="mt-1 flex items-center justify-center gap-2 text-center text-xs" style={{ color: "var(--lm-muted)" }}>
          <MoveRight className="h-3.5 w-3.5" style={{ color: "var(--lm-accent)" }} />
          Point at a plate to inspect the product
        </p>
      </div>
    </section>
  );
}
