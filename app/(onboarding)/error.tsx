"use client"

import { RouteError } from "@/components/layout/route-error"

// Error boundary for the org-creation onboarding wizard.
export default function OnboardingError(props: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <RouteError {...props} homeHref="/" homeLabel="Back to home" />
  )
}
