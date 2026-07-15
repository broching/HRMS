"use client"

import * as React from "react"
import { useAuth } from "@clerk/nextjs"
import { useRouter, useSearchParams } from "next/navigation"

/**
 * Bridges the return from Stripe (Checkout success/cancel, or the billing
 * portal) back to /hr-lounge/billing.
 *
 * Why this exists: on a Clerk dev instance the session cookie can be momentarily
 * absent on the first request right after a cross-site redirect. If Stripe
 * returned straight to /hr-lounge/billing, that page's server-side auth guard
 * (app/(app)/layout.tsx) would see "signed-out" and bounce the user to the
 * landing page. This route sits OUTSIDE the (app) group — no server guard — so
 * we can wait for Clerk to finish loading client-side (which re-establishes the
 * session cookie) before forwarding. Preserves the `?checkout=` flag the billing
 * page toasts on.
 */
export function BillingReturn() {
  const { isLoaded, isSignedIn } = useAuth()
  const router = useRouter()
  const params = useSearchParams()

  React.useEffect(() => {
    if (!isLoaded) return
    const checkout = params.get("checkout")
    const query = checkout ? `?checkout=${encodeURIComponent(checkout)}` : ""
    router.replace(isSignedIn ? `/hr-lounge/billing${query}` : "/")
  }, [isLoaded, isSignedIn, params, router])

  return (
    <div className="flex min-h-svh w-full items-center justify-center">
      <div className="text-muted-foreground flex flex-col items-center gap-3">
        <div className="border-primary/30 border-t-primary size-8 animate-spin rounded-full border-2" />
        <p className="text-sm">Finishing up…</p>
      </div>
    </div>
  )
}
