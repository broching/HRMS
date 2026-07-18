"use client"

import { useCurrentMember } from "@/hooks/use-current-member"
import type { ModuleKey } from "@/convex/lib/modules"

/**
 * The set of product modules the current org has enabled, resolved from
 * `members.current.enabledModules` (the authoritative client source). Used to
 * gate self-service (non-permission-gated) surfaces like the Home sub-nav and
 * dashboard tiles. Permission-gated surfaces don't need this — disabled-module
 * permissions are already stripped server-side.
 *
 * Returns `undefined` while the membership is still loading so callers can
 * distinguish "not yet known" from "disabled".
 */
export function useEnabledModules(): Set<ModuleKey> | undefined {
  const member = useCurrentMember()
  if (member === undefined) return undefined
  return new Set((member?.enabledModules ?? []) as ModuleKey[])
}

/** Whether the current org has `module` enabled. `undefined` while loading. */
export function useHasModule(module: ModuleKey): boolean | undefined {
  const modules = useEnabledModules()
  if (modules === undefined) return undefined
  return modules.has(module)
}
