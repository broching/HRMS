"use client"

import { useCurrentMember } from "@/hooks/use-current-member"
import { permitted, type Permission } from "@/convex/lib/permissions"

/**
 * Whether the current member holds `permission`, resolved from their effective
 * permission list (`members.current.permissions`) — the authoritative gate for
 * client UI, correct for both preset and custom roles.
 *
 * Returns `undefined` while the membership is still loading so callers can
 * distinguish "not yet known" from "denied".
 */
export function useHasPermission(permission: Permission): boolean | undefined {
  const member = useCurrentMember()
  if (member === undefined) return undefined
  return permitted(member?.permissions, permission)
}
