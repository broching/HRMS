"use client";

import React from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { PrismMark, Wordmark } from "./prism-mark";
import Image from "next/image";

const LINKS = [
  { name: "Modules", href: "/#modules" },
  { name: "Pricing", href: "/#pricing" },
  { name: "FAQ", href: "/#faq" },
  { name: "Contact", href: "/#contact" },
];

export function LandingNav() {
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3">
      <nav
        className="mx-auto flex max-w-6xl items-center justify-between rounded-2xl px-4 py-2.5 transition-all duration-300 md:px-5"
        style={{
          background: scrolled
            ? "color-mix(in oklab, var(--lm-panel) 82%, transparent)"
            : "transparent",
          border: `1px solid ${scrolled ? "var(--lm-line)" : "transparent"}`,
          boxShadow: scrolled ? "var(--lm-shadow)" : "none",
          backdropFilter: scrolled ? "blur(14px)" : "none",
        }}
      >
        <Link href="/" aria-label="LeadMighty home" className="flex items-center gap-2">
          <Image
            src="/LeadMightylogo.png"
            alt="LeadMighty Logo"
            width={56}
            height={56}
            className="h-13 w-13"
            priority
          />
          <Wordmark />
        </Link>

        <ul className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 text-sm md:flex">
          {LINKS.map((l) => (
            <li key={l.name}>
              <Link
                href={l.href}
                className="transition-colors duration-150"
                style={{ color: "var(--lm-muted)" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--lm-ink)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--lm-muted)")}
              >
                {l.name}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2.5">
          <div className="hidden items-center gap-2.5 md:flex">
            <AuthLoading>
              <div
                className="h-8 w-20 animate-pulse rounded-lg"
                style={{ background: "var(--lm-panel)" }}
              />
            </AuthLoading>
            <Authenticated>
              <Link href="/dashboard" className="lm-btn lm-btn-ghost !px-4 !py-2 text-sm">
                Dashboard
              </Link>
              <UserButton />
            </Authenticated>
            <Unauthenticated>
              <SignInButton mode="modal">
                <button
                  className="text-sm font-medium transition-colors"
                  style={{ color: "var(--lm-muted)" }}
                >
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="lm-btn lm-btn-primary !px-4 !py-2 text-sm">
                  Get started
                </button>
              </SignUpButton>
            </Unauthenticated>
          </div>

          <button
            className="grid h-9 w-9 place-items-center rounded-lg md:hidden"
            style={{ border: "1px solid var(--lm-line)" }}
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {open && (
        <div
          className="mx-auto mt-2 max-w-6xl rounded-2xl p-4 md:hidden"
          style={{
            background: "color-mix(in oklab, var(--lm-panel) 92%, transparent)",
            border: "1px solid var(--lm-line)",
            boxShadow: "var(--lm-shadow-lg)",
            backdropFilter: "blur(14px)",
          }}
        >
          <ul className="flex flex-col gap-1">
            {LINKS.map((l) => (
              <li key={l.name}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm"
                  style={{ color: "var(--lm-ink)" }}
                >
                  {l.name}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-col gap-2 border-t pt-3" style={{ borderColor: "var(--lm-line)" }}>
            <Unauthenticated>
              <SignInButton mode="modal">
                <button className="lm-btn lm-btn-ghost w-full">Sign in</button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="lm-btn lm-btn-primary w-full">Get started</button>
              </SignUpButton>
            </Unauthenticated>
            <Authenticated>
              <Link href="/dashboard" className="lm-btn lm-btn-primary w-full">
                Go to dashboard
              </Link>
            </Authenticated>
          </div>
        </div>
      )}
    </header>
  );
}
