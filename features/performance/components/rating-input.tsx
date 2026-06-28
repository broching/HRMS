"use client"

import { IconStarFilled, IconStar } from "@tabler/icons-react"
import { cn } from "@/lib/utils"

/** A 1..max star rating picker (or read-only display). */
export function RatingInput({
  value,
  max,
  onChange,
  readOnly,
}: {
  value: number | null
  max: number
  onChange?: (v: number) => void
  readOnly?: boolean
}) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => {
        const filled = value != null && n <= value
        const Icon = filled ? IconStarFilled : IconStar
        return (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            onClick={() => onChange?.(n)}
            className={cn(
              "transition-colors",
              filled ? "text-amber-500" : "text-muted-foreground",
              readOnly ? "cursor-default" : "hover:text-amber-500",
            )}
            aria-label={`${n} of ${max}`}
          >
            <Icon className="size-5" />
          </button>
        )
      })}
      {value != null && (
        <span className="text-muted-foreground ml-1 text-sm">
          {value}/{max}
        </span>
      )}
    </div>
  )
}
