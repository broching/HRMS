"use client";

import React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { SectionHeading } from "./section-heading";
import { Reveal } from "./reveal";

type Faq = { q: string; a: React.ReactNode };

// Real questions a team evaluating LeadMightyHR actually asks. Ordered by how
// early they come up in a conversation — not a numbered sequence, so no indices.
const FAQS: Faq[] = [
  {
    q: "How does pricing work?",
    a: (
      <>
        You pay for a Core platform priced by team size, plus a flat monthly fee
        for each module you switch on — leave, claims, payroll, attendance and
        the rest. No per-feature upsells and no bundles you don&apos;t need. Turn
        modules on or off as you grow; billing follows what&apos;s enabled.
      </>
    ),
  },
  {
    q: "Is it built for Singapore payroll?",
    a: (
      <>
        Yes. The payroll module computes CPF by citizenship, PR status and age
        band, handles SDL and the self-help group funds (CDAC, MBMF, SINDA,
        ECF), and prorates incomplete months the MOM way. You can build payslip
        templates, run a multi-step approval, and export the run for your bank
        and statutory filing.
      </>
    ),
  },
  {
    q: "Can we start with just one module?",
    a: (
      <>
        Absolutely. Start with Core plus a single module — say, Leave — and add
        Claims, Payroll or anything else whenever you&apos;re ready. Your people,
        org chart and settings carry across every module you turn on.
      </>
    ),
  },
  {
    q: "How long does setup take?",
    a: (
      <>
        Most teams are live within a day. Import your employees from a
        spreadsheet, invite your admins, and configure the modules you need — we
        help with the migration so nothing gets lost on the way in.
      </>
    ),
  },
  {
    q: "Where does our data live, and who can see it?",
    a: (
      <>
        Each organisation&apos;s data is fully isolated from every other tenant,
        and role-based permissions decide exactly what each person can view or
        change. Sensitive fields — compensation, payslips — are gated to the
        people who should see them. Enterprise customers can run on a dedicated,
        single-tenant deployment on their own domain.
      </>
    ),
  },
  {
    q: "Does it work on mobile?",
    a: (
      <>
        Yes. LeadMightyHR is an installable web app — add it to your phone&apos;s
        home screen and staff can request leave, submit claims, clock in and
        check payslips on the go. No app-store download required.
      </>
    ),
  },
  {
    q: "Can we cancel anytime?",
    a: (
      <>
        Billing is monthly with no lock-in. Change your team size, add or drop
        modules, or cancel whenever you need to — you&apos;re only ever billed
        for what&apos;s switched on.
      </>
    ),
  },
];

export function FaqSection() {
  const [open, setOpen] = React.useState<number | null>(0);

  return (
    <section id="faq" className="scroll-mt-24 py-24 md:py-32">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 md:grid-cols-[0.85fr_1.15fr] md:gap-16">
        <div className="md:sticky md:top-28 md:self-start">
          <SectionHeading
            eyebrow="FAQ"
            title={
              <>
                The questions
                <br />
                teams ask us.
              </>
            }
            lede="Everything you need before you commit. Still unsure? A real person answers — usually the same day."
          />
          <Reveal delay={120}>
            <Link
              href="#contact"
              className="lm-btn lm-btn-ghost mt-8 !px-4 !py-2.5 text-sm"
            >
              Ask us anything
            </Link>
          </Reveal>
        </div>

        <Reveal delay={100}>
          <ul
            className="lm-card overflow-hidden"
            style={{ background: "var(--lm-panel)" }}
          >
            {FAQS.map((item, i) => {
              const isOpen = open === i;
              return (
                <li
                  key={item.q}
                  style={{
                    borderTop:
                      i === 0 ? "none" : "1px solid var(--lm-line)",
                  }}
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left md:px-7"
                  >
                    <span
                      className="text-[1.02rem] font-semibold"
                      style={{ color: "var(--lm-ink)" }}
                    >
                      {item.q}
                    </span>
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full transition-transform duration-300"
                      style={{
                        border: "1px solid var(--lm-line-2)",
                        color: "var(--lm-accent)",
                        transform: isOpen ? "rotate(135deg)" : "none",
                      }}
                      aria-hidden
                    >
                      <Plus className="h-4 w-4" />
                    </span>
                  </button>
                  <div
                    className="grid transition-all duration-300 ease-out"
                    style={{
                      gridTemplateRows: isOpen ? "1fr" : "0fr",
                      opacity: isOpen ? 1 : 0,
                    }}
                  >
                    <div className="overflow-hidden">
                      <p
                        className="px-5 pb-6 text-[0.92rem] leading-relaxed md:px-7"
                        style={{ color: "var(--lm-muted)" }}
                      >
                        {item.a}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
