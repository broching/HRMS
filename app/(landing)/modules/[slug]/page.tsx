import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LandingNav } from "../../_components/landing-nav";
import { SiteFooter } from "../../_components/site-footer";
import { ModuleSheet } from "../_components/module-sheet";
import { MODULES, MODULE_BY_SLUG } from "../modules-data";

export function generateStaticParams() {
  return MODULES.map((m) => ({ slug: m.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const m = MODULE_BY_SLUG[slug];
  if (!m) return {};
  return {
    title: `${m.name} — LeadMightyHR`,
    description: m.metaDescription,
  };
}

export default async function ModulePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!MODULE_BY_SLUG[slug]) notFound();

  return (
    <main>
      <LandingNav />
      <ModuleSheet slug={slug} />
      <SiteFooter />
    </main>
  );
}
