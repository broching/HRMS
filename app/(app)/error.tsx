"use client"

import { RouteError } from "@/components/layout/route-error"

// Error boundary for all authenticated feature routes. Renders inside the
// persistent app chrome (top nav + section rail) so the user keeps navigation.
export default function AppError(props: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <RouteError {...props} />
}
