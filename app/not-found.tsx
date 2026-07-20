import type { Metadata } from "next"
import Link from "next/link"
import { IconArrowRight, IconHome } from "@tabler/icons-react"
import { LogoMark } from "@/app/(landing)/_components/prism-mark"

export const metadata: Metadata = {
  title: "Page not found — LeadMighty",
  robots: { index: false, follow: false },
}

// LeadMightyHR-branded 404. Self-contained (no dependency on the landing's
// scoped CSS variables, which aren't loaded outside the marketing group): brand
// colours are inlined so this renders correctly anywhere in the app tree. The
// "Blueprint" aesthetic — cool drafting paper, a faint engineering grid, navy
// ink and a refracted product spectrum — echoes the marketing surface.
const INK = "#0c1a3a"
const INK_2 = "#33436b"
const MUTED = "#64729a"
const ACCENT = "#1e56e8"
const SPECTRUM = ["#1e56e8", "#7a5af0", "#0ea5a0", "#e8850c"]

export default function NotFound() {
  return (
    <main
      className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-6 py-16 text-center"
      style={{
        background:
          "radial-gradient(60rem 38rem at 82% -12%, rgba(30,86,232,0.14), transparent 66%)," +
          "radial-gradient(46rem 36rem at 4% 6%, rgba(75,130,255,0.10), transparent 60%)," +
          "linear-gradient(180deg, #ffffff 0%, #eef3fb 36%, #eef3fb 100%)",
        color: INK,
      }}
    >
      {/* Faint engineering grid, masked toward the top like the landing surface. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          opacity: 0.5,
          backgroundImage:
            "linear-gradient(to right, rgba(185,200,230,0.7) 1px, transparent 1px)," +
            "linear-gradient(to bottom, rgba(185,200,230,0.7) 1px, transparent 1px)",
          backgroundSize: "30px 30px",
          WebkitMaskImage:
            "radial-gradient(120% 80% at 50% -10%, #000 0%, transparent 60%)",
          maskImage:
            "radial-gradient(120% 80% at 50% -10%, #000 0%, transparent 60%)",
        }}
      />

      <div className="relative flex flex-col items-center">
        {/* Brand lockup */}
        <Link href="/" className="mb-10 flex items-center gap-2.5">
          <LogoMark className="h-9 w-9" />
          <span
            className="text-[1.28rem] tracking-tight"
            style={{ fontWeight: 700, color: INK }}
          >
            Lead<span style={{ color: ACCENT }}>Mighty</span>
            <span style={{ color: "#2f4168" }}>HR</span>
          </span>
        </Link>

        {/* Refracted spectrum — the prism motif, as a thin drafted rule */}
        <div className="mb-6 flex items-center gap-1.5" aria-hidden>
          {SPECTRUM.map((hue) => (
            <span
              key={hue}
              className="h-1 w-8 rounded-full"
              style={{ backgroundColor: hue }}
            />
          ))}
        </div>

        <p
          className="font-mono text-xs tracking-[0.22em] uppercase"
          style={{ color: MUTED }}
        >
          Error 404
        </p>

        <h1
          className="mt-4 text-7xl font-black tracking-tight tabular-nums sm:text-8xl"
          style={{
            backgroundImage: `linear-gradient(120deg, ${SPECTRUM[0]}, ${SPECTRUM[1]} 45%, ${SPECTRUM[2]} 80%)`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          404
        </h1>

        <h2
          className="mt-6 text-2xl font-bold tracking-tight sm:text-3xl"
          style={{ color: INK }}
        >
          This page went off the blueprint
        </h2>
        <p
          className="mt-3 max-w-md text-base leading-relaxed"
          style={{ color: INK_2 }}
        >
          The page you&apos;re looking for doesn&apos;t exist, moved, or was never
          drafted. Let&apos;s get you back on track.
        </p>

        <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5"
            style={{
              backgroundImage: `linear-gradient(180deg, #4b82ff, ${ACCENT})`,
              boxShadow: "0 14px 30px -12px rgba(30,86,232,0.7)",
            }}
          >
            <IconHome className="size-4" />
            Back to home
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-full border bg-white px-6 py-3 text-sm font-semibold transition-colors"
            style={{ borderColor: "#b9c8e6", color: INK }}
          >
            Go to your dashboard
            <IconArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </main>
  )
}
