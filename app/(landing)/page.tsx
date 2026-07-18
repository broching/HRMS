import type { Metadata } from "next";
import { LandingNav } from "./_components/landing-nav";
import { HrHero } from "./leadmightyhr/_components/hr-hero";
import { Reveal } from "./_components/reveal";
import { ModuleShowcase } from "./leadmightyhr/_components/module-showcase";
import { PricingSection } from "./_components/pricing-section";
import { FaqSection } from "./_components/faq-section";
import { ContactSection } from "./_components/contact-section";
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

      <PricingSection />

      <FaqSection />

      <ContactSection />

      <SiteFooter />
    </main>
  );
}
