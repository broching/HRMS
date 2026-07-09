"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  LeaveDetailDialog,
  type LeaveDetailRow,
} from "@/features/leave/components/leave-detail-dialog"

/** Low-opacity tint for a hex colour, e.g. "#6b7280" → cell background. */
function tint(color: string): string | undefined {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}26` : undefined
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n.charAt(0))
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function WhoIsAway() {
  const today = new Date()
  const [year, setYear] = React.useState(today.getFullYear())
  const [month, setMonth] = React.useState(today.getMonth()) // 0-based
  const [selected, setSelected] = React.useState<LeaveDetailRow | null>(null)

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstWeekday = new Date(year, month, 1).getDay()
  const monthStart = iso(year, month, 1)
  const monthEnd = iso(year, month, daysInMonth)

  const away = useQuery(api.leaveRequests.calendar, {
    start: monthStart,
    end: monthEnd,
  })

  // Map each day-number in this month to the leave-type colours away that day.
  const awayColors = React.useMemo(() => {
    const map = new Map<number, string[]>()
    if (!away) return map
    for (const leave of away) {
      for (let d = 1; d <= daysInMonth; d++) {
        const day = iso(year, month, d)
        if (leave.startDate <= day && leave.endDate >= day) {
          const list = map.get(d) ?? []
          if (!list.includes(leave.leaveTypeColor)) list.push(leave.leaveTypeColor)
          map.set(d, list)
        }
      }
    }
    return map
  }, [away, year, month, daysInMonth])

  function shift(delta: number) {
    const next = new Date(year, month + delta, 1)
    setYear(next.getFullYear())
    setMonth(next.getMonth())
  }

  const isCurrentMonth =
    year === today.getFullYear() && month === today.getMonth()

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Who&apos;s away?</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => shift(-1)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Previous month"
          >
            <IconChevronLeft className="size-4" />
          </button>
          <span className="text-sm font-medium">
            {MONTHS[month]} {year}
          </span>
          <button
            onClick={() => shift(1)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Next month"
          >
            <IconChevronRight className="size-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((w) => (
            <span key={w} className="text-muted-foreground py-1 text-xs">
              {w}
            </span>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <span key={`e${i}`} />
            const isToday = isCurrentMonth && d === today.getDate()
            const colors = awayColors.get(d)
            const isAway = !!colors?.length
            return (
              <span
                key={d}
                className={cn(
                  "relative flex aspect-square flex-col items-center justify-center rounded-md text-sm",
                  isAway && "font-medium",
                  isToday && "ring-primary ring-1",
                )}
                style={isAway ? { backgroundColor: tint(colors![0]) } : undefined}
              >
                {d}
                {isAway && (
                  <span className="absolute bottom-1 flex gap-0.5">
                    {colors!.slice(0, 3).map((c, ci) => (
                      <span
                        key={ci}
                        className="size-1 rounded-full"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </span>
                )}
              </span>
            )
          })}
        </div>

        <div className="flex flex-col gap-2 border-t pt-3">
          {away === undefined ? (
            <Skeleton className="h-10 w-full" />
          ) : away.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No one is away this month.
            </p>
          ) : (
            away.slice(0, 6).map((leave) => (
              <button
                key={leave._id}
                onClick={() => setSelected(leave)}
                className="hover:bg-accent/50 -mx-2 flex items-center gap-2 rounded-md px-2 py-1 text-left transition-colors"
              >
                <Avatar className="size-8">
                  <AvatarFallback
                    className="text-xs"
                    style={{
                      backgroundColor: tint(leave.leaveTypeColor),
                      color: leave.leaveTypeColor,
                    }}
                  >
                    {initials(leave.employeeName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="text-muted-foreground text-xs">
                    {leave.startDate.slice(5)} – {leave.endDate.slice(5)}
                  </span>
                  <span className="text-sm font-medium leading-tight">
                    {leave.employeeName}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: leave.leaveTypeColor }}
                    />
                    <span className="text-muted-foreground">
                      {leave.leaveTypeName}
                    </span>
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </CardContent>

      <LeaveDetailDialog
        leave={selected}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </Card>
  )
}
