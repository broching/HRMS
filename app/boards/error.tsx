"use client"

import { RouteError } from "@/components/layout/route-error"

// Error boundary for the public job board (no auth).
export default function BoardsError(props: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <RouteError {...props} homeHref="/" homeLabel="Back to home" />
}
