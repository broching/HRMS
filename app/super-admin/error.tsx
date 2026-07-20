"use client"

import { RouteError } from "@/components/layout/route-error"

// Error boundary for the cross-tenant super-admin console.
export default function SuperAdminError(props: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <RouteError {...props} homeHref="/super-admin" homeLabel="Back to console" />
  )
}
