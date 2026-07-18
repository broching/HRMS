import Link from "next/link";
import { LogoMark, Wordmark } from "./prism-mark";
import { PRODUCTS, STATUS_LABEL } from "./products";

export function SiteFooter() {
  return (
    <footer className="border-t" style={{ borderColor: "var(--lm-line)" }}>
      <div className="mx-auto max-w-6xl px-5 py-16">
        <div className="grid gap-12 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-2">
              <LogoMark className="h-9 w-9" />
              <Wordmark />
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-relaxed" style={{ color: "var(--lm-muted)" }}>
              A growing suite of B2B software on one shared spine. Making businesses mightier, one
              product at a time.
            </p>
          </div>

          <div>
            <h4 className="lm-eyebrow mb-4">Products</h4>
            <ul className="space-y-2.5">
              {PRODUCTS.map((p) => (
                <li key={p.code}>
                  <a
                    href={p.status === "live" ? "/leadmightyhr" : "/#contact"}
                    className="flex items-center gap-2 text-sm transition-colors"
                    style={{ color: "var(--lm-muted)" }}
                  >
                    {p.name}
                    <span
                      className="lm-mono text-[9px] uppercase"
                      style={{ color: p.status === "live" ? p.hue : "var(--lm-muted-2)" }}
                    >
                      {p.status === "live" ? "live" : "soon"}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="lm-eyebrow mb-4">Company</h4>
            <ul className="space-y-2.5 text-sm" style={{ color: "var(--lm-muted)" }}>
              <li><a href="/#modules">Modules</a></li>
              <li><a href="/#pricing">Pricing</a></li>
              <li><a href="/#faq">FAQ</a></li>
              <li><a href="/#contact">Contact</a></li>
              <li><a href="mailto:hello@leadmighty.com">hello@leadmighty.com</a></li>
            </ul>
          </div>

          <div>
            <h4 className="lm-eyebrow mb-4">Support &amp; legal</h4>
            <ul className="space-y-2.5 text-sm" style={{ color: "var(--lm-muted)" }}>
              <li><Link href="/support">Support</Link></li>
              <li><Link href="/legal/security">Security</Link></li>
              <li><Link href="/legal/terms">Terms of Service</Link></li>
              <li><Link href="/legal/privacy">Privacy Policy</Link></li>
            </ul>
          </div>
        </div>

        <div
          className="mt-14 flex flex-col items-center justify-between gap-3 border-t pt-6 text-xs sm:flex-row"
          style={{ borderColor: "var(--lm-line)", color: "var(--lm-muted-2)" }}
        >
          <p>© {new Date().getFullYear()} LeadMighty. All rights reserved.</p>
          <p className="lm-mono" style={{ letterSpacing: "0.1em" }}>
            {STATUS_LABEL.live} · LM·HR
          </p>
        </div>
      </div>
    </footer>
  );
}
