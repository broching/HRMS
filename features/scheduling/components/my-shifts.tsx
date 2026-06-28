"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { isoDate, addDays } from "@/features/scheduling/lib/dates"
import { formatMinutes } from "@/features/scheduling/lib/labels"

function formatDateHeading(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
}

export function MyShifts() {
  const start = isoDate(new Date())
  const end = isoDate(addDays(new Date(), 28))
  const shifts = useQuery(api.schedules.myShifts, { start, end })

  return (
    <Card className="mx-4 lg:mx-6">
      <CardHeader>
        <CardTitle>Upcoming shifts</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {shifts === undefined ? (
          <Skeleton className="h-24 w-full" />
        ) : shifts.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No published shifts in the next four weeks.
          </p>
        ) : (
          shifts.map((s) => (
            <div
              key={s._id}
              className="flex items-center gap-3 rounded-md border p-3"
            >
              <span
                className="h-10 w-1.5 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <div className="flex-1">
                <div className="font-medium">{formatDateHeading(s.date)}</div>
                <div className="text-muted-foreground text-sm">
                  {s.startTime}–{s.endTime}
                  {s.officeName ? ` · ${s.officeName}` : ""}
                  {s.note ? ` · ${s.note}` : ""}
                </div>
              </div>
              <span className="text-muted-foreground text-sm tabular-nums">
                {formatMinutes(s.durationMinutes)}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
