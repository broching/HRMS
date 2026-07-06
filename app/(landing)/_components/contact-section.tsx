"use client";

import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, Loader2, Mail } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Reveal } from "./reveal";
import { SectionHeading } from "./section-heading";
import { PRODUCTS } from "./products";

const schema = z.object({
  name: z.string().min(2, "Please tell us your name."),
  email: z.string().email("Enter a valid email address."),
  company: z.string().optional(),
  product: z.string().optional(),
  message: z.string().min(10, "A little more detail helps us route you."),
});
type FormValues = z.infer<typeof schema>;

export function ContactSection() {
  const submitLead = useMutation(api.leads.submitLead);
  const [done, setDone] = React.useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { product: PRODUCTS[0].name },
  });

  // Let product cards elsewhere on the page preselect a product here.
  React.useEffect(() => {
    const onSelect = (e: Event) => {
      const name = (e as CustomEvent<string>).detail;
      if (name) setValue("product", name);
    };
    window.addEventListener("lm-select-product", onSelect);
    return () => window.removeEventListener("lm-select-product", onSelect);
  }, [setValue]);

  const onSubmit = async (values: FormValues) => {
    try {
      await submitLead(values);
      setDone(true);
      reset();
      toast.success("Thanks — we'll be in touch shortly.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Try again.");
    }
  };

  const field =
    "w-full rounded-xl px-4 py-3 text-sm outline-none transition-colors";
  const fieldStyle: React.CSSProperties = {
    background: "var(--lm-panel-2)",
    border: "1px solid var(--lm-line-2)",
    color: "var(--lm-ink)",
  };

  return (
    <section id="contact" className="scroll-mt-24 py-24 md:py-32">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 md:grid-cols-[0.9fr_1.1fr] md:gap-16">
        <div>
          <SectionHeading
            eyebrow="Contact us"
            title={
              <>
                Let&apos;s make your
                <br />
                business <span className="lm-accent-text">mighty</span>.
              </>
            }
            lede="Tell us what you're running today and where it hurts. We'll show you how the suite fits — and get you set up on LeadMightyHR."
          />
          <Reveal delay={120}>
            <a
              href="mailto:hello@leadmighty.com"
              className="mt-8 inline-flex items-center gap-2.5 text-sm"
              style={{ color: "var(--lm-muted)" }}
            >
              <Mail className="h-4 w-4" style={{ color: "var(--lm-accent)" }} />
              hello@leadmighty.com
            </a>
          </Reveal>
        </div>

        <Reveal delay={100}>
          <div className="lm-card p-6 md:p-8">
            {done ? (
              <div className="flex min-h-[22rem] flex-col items-center justify-center text-center">
                <div
                  className="grid h-14 w-14 place-items-center rounded-2xl"
                  style={{
                    background: "color-mix(in oklab, var(--lm-accent) 16%, transparent)",
                    border: "1px solid color-mix(in oklab, var(--lm-accent) 34%, transparent)",
                  }}
                >
                  <CheckCircle2 className="h-7 w-7" style={{ color: "var(--lm-accent)" }} />
                </div>
                <h3 className="lm-display mt-5 text-2xl">Message received</h3>
                <p className="mt-2 max-w-sm text-sm" style={{ color: "var(--lm-muted)" }}>
                  Thanks for reaching out. A human from LeadMighty will get back to you within one
                  business day.
                </p>
                <button
                  type="button"
                  onClick={() => setDone(false)}
                  className="mt-6 text-sm font-semibold"
                  style={{ color: "var(--lm-accent)" }}
                >
                  Send another message
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="c-name" className="lm-eyebrow mb-2 block">
                      Name
                    </label>
                    <input id="c-name" className={field} style={fieldStyle} placeholder="Jane Tan" {...register("name")} />
                    {errors.name && <p className="mt-1.5 text-xs" style={{ color: "#dc2626" }}>{errors.name.message}</p>}
                  </div>
                  <div>
                    <label htmlFor="c-email" className="lm-eyebrow mb-2 block">
                      Work email
                    </label>
                    <input id="c-email" className={field} style={fieldStyle} placeholder="jane@company.com" {...register("email")} />
                    {errors.email && <p className="mt-1.5 text-xs" style={{ color: "#dc2626" }}>{errors.email.message}</p>}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="c-company" className="lm-eyebrow mb-2 block">
                      Company <span style={{ opacity: 0.6 }}>(optional)</span>
                    </label>
                    <input id="c-company" className={field} style={fieldStyle} placeholder="Acme Pte Ltd" {...register("company")} />
                  </div>
                  <div>
                    <label htmlFor="c-product" className="lm-eyebrow mb-2 block">
                      Interested in
                    </label>
                    <select id="c-product" className={field} style={fieldStyle} {...register("product")}>
                      {PRODUCTS.map((p) => (
                        <option key={p.code} value={p.name} style={{ background: "var(--lm-panel)" }}>
                          {p.name}
                        </option>
                      ))}
                      <option value="The whole suite" style={{ background: "var(--lm-panel)" }}>
                        The whole suite
                      </option>
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="c-message" className="lm-eyebrow mb-2 block">
                    What can we help with?
                  </label>
                  <textarea
                    id="c-message"
                    rows={4}
                    className={`${field} resize-none`}
                    style={fieldStyle}
                    placeholder="We're a 40-person team juggling spreadsheets for leave and payroll…"
                    {...register("message")}
                  />
                  {errors.message && <p className="mt-1.5 text-xs" style={{ color: "#dc2626" }}>{errors.message.message}</p>}
                </div>

                <button type="submit" disabled={isSubmitting} className="lm-btn lm-btn-primary w-full disabled:opacity-70">
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Sending…
                    </>
                  ) : (
                    <>
                      Send message <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
                <p className="text-center text-xs" style={{ color: "var(--lm-muted-2)" }}>
                  We&apos;ll only use your details to reply. No spam, ever.
                </p>
              </form>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
