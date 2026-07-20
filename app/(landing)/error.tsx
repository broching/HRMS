"use client"

import { RouteError } from "@/components/layout/route-error"

// Error boundary for the public marketing surface.
export default function LandingError(props: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <RouteError {...props} homeHref="/" homeLabel="Back to home" />
}
