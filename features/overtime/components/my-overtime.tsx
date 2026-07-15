"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  OVERTIME_STATUS_CLASSES,
  OVERTIME_STATUS_LABELS,
  formatOvertimeDate,
} from "@/features/overtime/lib/labels"

export function MyOvertime() {
  const rows = useQuery(api.overtime.myOvertime)

  return (
    <div className="px-4 lg:px-6">
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Overtime</CardTitle>
          <CardDescription>
            Overtime scheduled for you by your manager. You can only be paid for
            overtime that&apos;s scheduled here.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {rows === undefined ? (
            <Skeleton className="h-24 w-full" />
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No overtime scheduled.
            </p>
          ) : (
            rows.map((r) => (
              <div
                key={r._id}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {formatOvertimeDate(r.date)}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {(r.actualHours ?? r.plannedHours)}h × {r.multiplier}
                    {r.note ? ` · ${r.note}` : ""}
                  </span>
                </div>
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium",
                      OVERTIME_STATUS_CLASSES[r.status],
                    )}
                  >
                    {OVERTIME_STATUS_LABELS[r.status]}
                  </span>
                  {r.paid && (
                    <span className="text-muted-foreground text-[11px]">
                      paid
                    </span>
                  )}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
