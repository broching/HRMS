import { LandingNav } from "./_components/landing-nav";
import { BlueprintHero } from "./_components/blueprint-hero";
import { LogoStrip } from "./_components/logo-strip";
import { PlatformSection } from "./_components/platform-section";
import { ProductsSection } from "./_components/products-section";
import { TeamNote } from "./_components/team-note";
import { PrinciplesSection } from "./_components/principles-section";
import { ContactSection } from "./_components/contact-section";
import { SiteFooter } from "./_components/site-footer";

export default function LandingPage() {
  return (
    <main>
      <LandingNav />
      <BlueprintHero />
      <LogoStrip />
      <PlatformSection />
      <ProductsSection />
      <TeamNote />
      <PrinciplesSection />
      <ContactSection />
      <SiteFooter />
    </main>
  );
}
