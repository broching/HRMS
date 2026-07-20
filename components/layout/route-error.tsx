"use client"

import { useEffect } from "react"
import Link from "next/link"
import { IconAlertTriangle, IconHome, IconRefresh } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"

/**
 * Shared fallback UI for App Router `error.tsx` boundaries. Renders a calm,
 * theme-aware card with a "Try again" (calls the segment's `reset`) and a link
 * home. Keep this dependency-light: it must render even when a feature bundle
 * is what threw.
 */
export function RouteError({
  error,
  reset,
  homeHref = "/dashboard",
  homeLabel = "Back to dashboard",
}: {
  error: Error & { digest?: string }
  reset: () => void
  homeHref?: string
  homeLabel?: string
}) {
  useEffect(() => {
    // Surface for local debugging + any attached error reporter.
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-[60svh] flex-col items-center justify-center px-6 py-16 text-center">
      <div
        className="mb-6 flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive"
        aria-hidden
      >
        <IconAlertTriangle className="size-7" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Something went wrong
      </h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        An unexpected error interrupted this page. You can try again — if it
        keeps happening, please let us know.
      </p>
      {error.digest ? (
        <p className="mt-3 font-mono text-xs text-muted-foreground/70">
          Ref: {error.digest}
        </p>
      ) : null}
      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        <Button onClick={reset} className="gap-2">
          <IconRefresh className="size-4" />
          Try again
        </Button>
        <Button asChild variant="outline" className="gap-2">
          <Link href={homeHref}>
            <IconHome className="size-4" />
            {homeLabel}
          </Link>
        </Button>
      </div>
    </div>
  )
}
