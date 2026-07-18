import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Mail, MessagesSquare, ShieldCheck } from "lucide-react";
import { LandingNav } from "../_components/landing-nav";
import { SiteFooter } from "../_components/site-footer";
import { Reveal } from "../_components/reveal";

export const metadata: Metadata = {
  title: "Support — LeadMighty",
  description:
    "Get help with LeadMightyHR. Reach a real person, check security and trust, or find answers to common questions.",
};

const CHANNELS = [
  {
    icon: Mail,
    title: "Email support",
    body: "The fastest way to reach us. A real person replies within one business day — usually much sooner.",
    action: "support@leadmighty.com",
    href: "mailto:support@leadmighty.com",
  },
  {
    icon: MessagesSquare,
    title: "Talk to us",
    body: "Setting up, migrating from spreadsheets, or sizing a plan? Tell us what you're running and we'll help you fit it.",
    action: "Contact the team",
    href: "/#contact",
  },
  {
    icon: ShieldCheck,
    title: "Security & trust",
    body: "How we isolate, encrypt and control access to your data — plus how to report a vulnerability.",
    action: "Read the security page",
    href: "/legal/security",
  },
];

const TOPICS: { q: string; href: string }[] = [
  { q: "How does pricing work?", href: "/#pricing" },
  { q: "Is payroll built for Singapore (CPF)?", href: "/#faq" },
  { q: "Can we start with just one module?", href: "/#faq" },
  { q: "How long does setup take?", href: "/#faq" },
  { q: "Where does our data live?", href: "/legal/privacy" },
  { q: "Does it work on mobile?", href: "/#faq" },
];

export default function SupportPage() {
  return (
    <main>
      <LandingNav />

      {/* Header — blueprint */}
      <div className="lm-blueprint">
        <header className="mx-auto max-w-4xl px-5 pt-32 pb-16 md:pt-40 md:pb-24">
          <Link
            href="/"
            className="lm-mono inline-flex items-center gap-1.5 text-xs transition-colors"
            style={{ color: "var(--lm-muted)" }}
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to LeadMighty
          </Link>
          <p className="lm-eyebrow mt-8" style={{ color: "var(--lm-accent)" }}>
            Support
          </p>
          <h1 className="lm-display mt-3 text-[clamp(2.3rem,6vw,3.8rem)]">
            How can we help?
          </h1>
          <p
            className="mt-4 max-w-2xl text-[1.08rem] leading-relaxed"
            style={{ color: "var(--lm-ink-2)" }}
          >
            No ticket mazes, no bots reading from a script. Reach a real person,
            check how we handle your data, or find a quick answer below.
          </p>
        </header>
      </div>

      {/* Channels — drafting sheet */}
      <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <div className="grid gap-5 md:grid-cols-3">
          {CHANNELS.map((c, i) => (
            <Reveal key={c.title} delay={i * 90}>
              <a
                href={c.href}
                className="lm-card group flex h-full flex-col p-6 transition-all"
                style={{ background: "var(--lm-panel)" }}
              >
                <div
                  className="grid h-11 w-11 place-items-center rounded-xl"
                  style={{
                    background: "color-mix(in oklab, var(--lm-accent) 12%, #fff)",
                    border: "1px solid color-mix(in oklab, var(--lm-accent) 26%, transparent)",
                  }}
                >
                  <c.icon className="h-5 w-5" style={{ color: "var(--lm-accent)" }} />
                </div>
                <h2 className="lm-display mt-4 text-xl">{c.title}</h2>
                <p
                  className="mt-2 flex-1 text-sm leading-relaxed"
                  style={{ color: "var(--lm-muted)" }}
                >
                  {c.body}
                </p>
                <span
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold"
                  style={{ color: "var(--lm-accent)" }}
                >
                  {c.action}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </a>
            </Reveal>
          ))}
        </div>

        {/* Common topics */}
        <div className="mt-20">
          <Reveal>
            <div className="flex items-center gap-2.5">
              <span
                className="h-px w-8"
                style={{ background: "var(--lm-accent)" }}
                aria-hidden
              />
              <span className="lm-eyebrow">Common questions</span>
            </div>
          </Reveal>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {TOPICS.map((t, i) => (
              <Reveal key={t.q} delay={i * 60}>
                <Link
                  href={t.href}
                  className="lm-card group flex items-center justify-between gap-3 p-4 transition-all"
                  style={{ background: "var(--lm-panel-2)" }}
                >
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--lm-ink)" }}
                  >
                    {t.q}
                  </span>
                  <ArrowRight
                    className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                    style={{ color: "var(--lm-accent)" }}
                  />
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
