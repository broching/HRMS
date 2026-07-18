import { IconLoader2 } from "@tabler/icons-react"

import { cn } from "@/lib/utils"

/**
 * Universal loading fallback shown while a route segment's server component
 * streams in. Wired up via `loading.tsx` files so every navigation gives
 * immediate feedback instead of a frozen page when SSR is slow.
 */
export function PageLoader({
  label = "Loading…",
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex min-h-[50vh] w-full flex-col items-center justify-center gap-3 py-16",
        className,
      )}
    >
      <IconLoader2 className="text-primary size-7 animate-spin" />
      <span className="text-muted-foreground text-sm">{label}</span>
    </div>
  )
}
