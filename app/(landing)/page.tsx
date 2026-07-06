import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LandingNav } from "./_components/landing-nav";
import { HrHero } from "./leadmightyhr/_components/hr-hero";
import { Reveal } from "./_components/reveal";
import { ModuleShowcase } from "./leadmightyhr/_components/module-showcase";
import { SiteFooter } from "./_components/site-footer";


export const metadata: Metadata = {
  title: "LeadMightyHR — Run your whole team from one place",
  description:
    "The all-in-one HR platform for modern teams: people, leave, claims, CPF-ready payroll, attendance, performance and hiring — Singapore-first, and live today.",
};

export default function LeadMightyHrPage() {
  return (
    <main>
      <LandingNav />
      <HrHero />

      <div id="modules" className="scroll-mt-24 pt-16 md:pt-24">
        <div className="mx-auto mb-4 max-w-6xl px-5">
          <Reveal>
            <p className="lm-eyebrow" style={{ color: "var(--lm-accent)" }}>
              Inside the product
            </p>
            <h2 className="lm-display mt-3 max-w-2xl text-[clamp(1.9rem,4vw,2.9rem)]">
              Nine modules. One login. No spreadsheets in between.
            </h2>
          </Reveal>
        </div>
        <ModuleShowcase />
      </div>

      {/* Closing CTA */}
      <section className="mx-auto max-w-6xl px-5 py-24">
        <Reveal>
          <div
            className="relative overflow-hidden rounded-3xl px-6 py-14 text-center md:px-12 md:py-20"
            style={{
              background: "linear-gradient(135deg, color-mix(in oklab, var(--lm-accent) 12%, var(--lm-panel)), var(--lm-panel))",
              border: "1px solid color-mix(in oklab, var(--lm-accent) 26%, var(--lm-line))",
              boxShadow: "var(--lm-shadow-lg)",
            }}
          >
            <h2 className="lm-display mx-auto max-w-2xl text-[clamp(2rem,4.4vw,3rem)]">
              See LeadMightyHR on your own team.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[1.05rem]" style={{ color: "var(--lm-ink-2)" }}>
              Tell us what you&apos;re running today and we&apos;ll get you set up — usually
              within a day. Real people, no scripted demo.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/#contact" className="lm-btn lm-btn-primary">
                Talk to us <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/#products" className="lm-btn lm-btn-ghost">
                See the whole suite
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      <SiteFooter />
    </main>
  );
}
