"use client"

import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { addMonth, monthLabel } from "@/features/claims/lib/labels"

// Previous / next month stepper used across the claims views. `month` is
// "YYYY-MM".
export function MonthNav({
  month,
  onChange,
}: {
  month: string
  onChange: (month: string) => void
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        className="size-8"
        aria-label="Previous month"
        onClick={() => onChange(addMonth(month, -1))}
      >
        <IconChevronLeft className="size-4" />
      </Button>
      <span className="min-w-32 text-center text-sm font-medium">
        {monthLabel(month)}
      </span>
      <Button
        variant="outline"
        size="icon"
        className="size-8"
        aria-label="Next month"
        onClick={() => onChange(addMonth(month, 1))}
      >
        <IconChevronRight className="size-4" />
      </Button>
    </div>
  )
}
