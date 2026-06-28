"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"

/**
 * The current user's membership in the active organization.
 *
 * Returns `undefined` while loading, `null` when the user has no active org /
 * membership (onboarding), or the member summary (role, org, name) otherwise.
 */
export function useCurrentMember() {
  return useQuery(api.members.current)
}
