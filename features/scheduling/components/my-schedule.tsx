"use client"

import { useQuery } from "convex/react"
import Link from "next/link"
import { IconClock, IconExternalLink } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { todayIso, addDaysIso } from "@/features/timesheets/lib/time"
import { shiftDurationMinutes } from "@/convex/model/shiftTime"
import { formatMinutes } from "@/features/scheduling/lib/labels"

function formatDateHeading(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
}

export function MySchedule() {
  const start = todayIso()
  const end = addDaysIso(start, 28)
  const data = useQuery(api.schedules.mySchedule, { start, end })

  const hourly = data?.payType === "hourly"
  const title = hourly ? "Upcoming shifts" : "My schedule"

  // Only days with something scheduled (a shift or overtime).
  const activeDays = (data?.days ?? []).filter(
    (d) => d.shifts.length > 0 || d.overtime.length > 0,
  )

  return (
    <Card className="mx-4 lg:mx-6">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link href="/attendance">
            <IconClock className="size-4" />
            Clock in
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {data === undefined ? (
          <Skeleton className="h-24 w-full" />
        ) : activeDays.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {hourly
              ? "No shifts scheduled in the next four weeks."
              : "No working days scheduled in the next four weeks."}
          </p>
        ) : (
          activeDays.map((day) => (
            <div key={day.date} className="rounded-md border p-3">
              <div className="mb-1.5 text-sm font-medium">
                {formatDateHeading(day.date)}
              </div>
              <div className="flex flex-col gap-1.5">
                {day.shifts.map((s, i) => (
                  <div key={`s${i}`} className="flex items-center gap-3">
                    <span
                      className="h-8 w-1.5 rounded-full"
                      style={{ backgroundColor: s.color }}
                    />
                    <div className="flex-1 text-sm">
                      <span className="tabular-nums">
                        {s.startTime}–{s.endTime}
                      </span>
                      {s.note ? (
                        <span className="text-muted-foreground"> · {s.note}</span>
                      ) : null}
                      {s.derived ? (
                        <span className="text-muted-foreground"> · usual hours</span>
                      ) : null}
                    </div>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {formatMinutes(
                        shiftDurationMinutes(s.startTime, s.endTime, s.breakMinutes),
                      )}
                    </span>
                  </div>
                ))}
                {day.overtime.map((o, i) => (
                  <div
                    key={`o${i}`}
                    className="flex items-center gap-3 text-amber-700 dark:text-amber-300"
                  >
                    <span className="h-8 w-1.5 rounded-full bg-amber-500" />
                    <div className="flex-1 text-sm">
                      {o.startTime && o.endTime
                        ? `Overtime ${o.startTime}–${o.endTime}`
                        : `Overtime ${o.plannedHours}h`}
                      <span className="text-muted-foreground">
                        {" "}
                        · {o.multiplier}×{o.status === "approved" ? " · confirmed" : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
        <Button asChild variant="ghost" size="sm" className="self-start">
          <Link href="/attendance">
            View attendance <IconExternalLink className="size-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
