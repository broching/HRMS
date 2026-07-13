"use client"

import { useEffect, Suspense } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import posthog from "posthog-js"
import { useAuth, useUser } from "@clerk/nextjs"

/**
 * PostHog analytics + session replay. No-ops unless NEXT_PUBLIC_POSTHOG_KEY is
 * set, so local/dev without a key is unaffected.
 *
 * Privacy: this is an HR product with sensitive PII (salaries, NRIC, bank
 * details). Session recordings therefore MASK ALL INPUTS by default so typed
 * values are never captured. Tighten further (e.g. mask text) in the PostHog
 * project settings or below if needed. Person profiles are `identified_only`.
 */
function isLoaded(): boolean {
  return !!(posthog as unknown as { __loaded?: boolean }).__loaded
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!key || isLoaded()) return
    posthog.init(key, {
      api_host:
        process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      // We capture pageviews manually for the App Router (see PageViewTracker).
      capture_pageview: false,
      capture_pageleave: true,
      person_profiles: "identified_only",
      session_recording: {
        maskAllInputs: true,
      },
    })
  }, [])

  return (
    <>
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
      <IdentifyUser />
      {children}
    </>
  )
}

// App Router client navigations don't trigger a full load, so capture $pageview
// whenever the path or query changes.
function PageViewTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!pathname || !isLoaded()) return
    let url = window.location.origin + pathname
    const qs = searchParams?.toString()
    if (qs) url += `?${qs}`
    posthog.capture("$pageview", { $current_url: url })
  }, [pathname, searchParams])

  return null
}

// Tie events + recordings to the signed-in user; reset on sign-out so a shared
// device doesn't blend identities.
function IdentifyUser() {
  const { isSignedIn, userId } = useAuth()
  const { user } = useUser()

  useEffect(() => {
    if (!isLoaded()) return
    if (isSignedIn && userId) {
      posthog.identify(userId, {
        email: user?.primaryEmailAddress?.emailAddress,
        name: user?.fullName ?? undefined,
      })
    } else if (isSignedIn === false) {
      posthog.reset()
    }
  }, [isSignedIn, userId, user])

  return null
}
