import { cn } from "@/lib/utils";

// The LeadMighty mark: a single line entering a prism and fanning into the
// product spectrum — the whole brand thesis in a glyph. Tuned for the light
// drafting surface (navy linework rather than a glowing beam).
export function PrismMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-8 w-8", className)}
      aria-hidden="true"
    >
      {/* incoming line */}
      <path d="M2 20h11" stroke="#0C1A3A" strokeWidth="2" strokeLinecap="round" />
      {/* prism triangle */}
      <path
        d="M14 8.5 30 20 14 31.5V8.5Z"
        fill="url(#pm-fill)"
        stroke="#1E56E8"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* refracted spectrum */}
      <path d="M30 20l7-6.5" stroke="#1E56E8" strokeWidth="2" strokeLinecap="round" />
      <path d="M30 20l8-1.5" stroke="#7A5AF0" strokeWidth="2" strokeLinecap="round" />
      <path d="M30 20l8 3" stroke="#0EA5A0" strokeWidth="2" strokeLinecap="round" />
      <path d="M30 20l7 6.5" stroke="#E8850C" strokeWidth="2" strokeLinecap="round" />
      <defs>
        <linearGradient id="pm-fill" x1="14" y1="8.5" x2="30" y2="31.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1E56E8" stopOpacity="0.18" />
          <stop offset="1" stopColor="#4B82FF" stopOpacity="0.06" />
        </linearGradient>
      </defs>
    </svg>
  );
}

// The app-icon lockup of the mark: the prism-into-spectrum glyph in white on a
// brand-blue tile. Crisp at every size (nav, footer, favicon) and reads on both
// the light drafting sheet and the dark blueprint bands.
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-9 w-9", className)}
      aria-hidden="true"
    >
      <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#lm-tile)" />
      {/* incoming line */}
      <path d="M9 24h8" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" opacity="0.95" />
      {/* prism */}
      <path
        d="M17 13.5 34 24 17 34.5V13.5Z"
        fill="rgba(255,255,255,0.16)"
        stroke="#fff"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* refracted spectrum */}
      <path d="M34 24l7-6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M34 24h8.5" stroke="#bcd4ff" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M34 24l7 6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <defs>
        <linearGradient id="lm-tile" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4B82FF" />
          <stop offset="1" stopColor="#1E56E8" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn("lm-display text-[1.28rem] tracking-tight", className)}
      style={{ fontWeight: 700, color: "var(--lm-ink)" }}
    >
      Lead<span style={{ color: "var(--lm-accent)" }}>Mighty</span>
      
      <span style={{ color: "#2f4168" }}>HR</span>
    </span>
  );
}
