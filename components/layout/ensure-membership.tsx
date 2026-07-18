"use client"

import { useEffect, useRef } from "react"
import { useMutation, useAction, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { isDedicatedClient } from "@/lib/deployment"

/**
 * Provisions the signed-in user's membership in the active organization on
 * load (idempotent). Makes the app resilient to webhook lag or missing
 * organizationMembership.* event subscriptions — the Clerk webhook still
 * reconciles the real membership id afterwards.
 *
 * On a DEDICATED Enterprise deployment the database starts empty (the org's
 * Clerk `*.created` webhooks fired against the shared deployment, never here),
 * so `ensureSelf` alone can't help — it needs the org row to already exist.
 * There we additionally run `dedicated.bootstrap`, which pulls the pinned org +
 * caller + membership from Clerk and creates those rows. Once it succeeds,
 * `members.current` flips non-null reactively and we stop.
 */
export function EnsureMembership() {
  const ensureSelf = useMutation(api.members.ensureSelf)
  const bootstrap = useAction(api.dedicated.bootstrap)
  const dedicated = isDedicatedClient()
  const current = useQuery(api.members.current)
  const tries = useRef(0)

  useEffect(() => {
    ensureSelf({}).catch(() => {
      // No active org / not yet synced — safe to ignore; queries degrade
      // gracefully and this retries on the next load.
    })
  }, [ensureSelf])

  useEffect(() => {
    if (!dedicated) return
    // undefined = still loading/auth not ready; non-null = already provisioned.
    if (current !== null) return
    if (tries.current >= 3) return
    tries.current += 1
    bootstrap({})
      .then((r) => {
        // Bootstrap created the rows; ensureSelf reconciles the employee link.
        if (r?.ok) ensureSelf({}).catch(() => {})
      })
      .catch(() => {
        // Auth not ready yet or a transient error — retries when `current`
        // resolves (undefined → null) after auth settles.
      })
  }, [dedicated, current, bootstrap, ensureSelf])

  return null
}
