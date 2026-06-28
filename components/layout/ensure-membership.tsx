"use client"

import { useEffect } from "react"
import { useMutation } from "convex/react"
import { api } from "@/convex/_generated/api"

/**
 * Provisions the signed-in user's membership in the active organization on
 * load (idempotent). Makes the app resilient to webhook lag or missing
 * organizationMembership.* event subscriptions — the Clerk webhook still
 * reconciles the real membership id afterwards.
 */
export function EnsureMembership() {
  const ensureSelf = useMutation(api.members.ensureSelf)
  useEffect(() => {
    ensureSelf({}).catch(() => {
      // No active org / not yet synced — safe to ignore; queries degrade
      // gracefully and this retries on the next load.
    })
  }, [ensureSelf])
  return null
}
