"use client"

import { useCallback } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

/**
 * Make a set of tabs deep-linkable through a URL query param (default `tab`).
 *
 * Returns the active value — reactive to the URL, so the global search (or any
 * link) can jump straight to a specific tab — and a setter that writes the param
 * with a shallow `router.replace`. The `fallback` tab is represented by an absent
 * param so the canonical URL for the default tab stays clean (e.g.
 * `/hr-lounge/payroll` rather than `/hr-lounge/payroll?tab=runs`).
 *
 * Use this instead of local `useState` / uncontrolled `defaultValue` on Radix
 * Tabs whenever a tab should be addressable.
 */
export function useTabParam(
  values: readonly string[],
  fallback: string,
  param: string = "tab",
): [string, (value: string) => void] {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const raw = searchParams.get(param)
  const active = raw && values.includes(raw) ? raw : fallback

  const setActive = useCallback(
    (value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value === fallback) params.delete(param)
      else params.set(param, value)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [router, pathname, searchParams, param, fallback],
  )

  return [active, setActive]
}
