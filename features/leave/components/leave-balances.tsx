"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export function LeaveBalances() {
  const balances = useQuery(api.leaveBalances.myBalances, {})

  if (balances === undefined) {
    return (
      <div className="grid gap-4 px-4 sm:grid-cols-2 lg:grid-cols-4 lg:px-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-4 px-4 sm:grid-cols-2 lg:grid-cols-4 lg:px-6">
      {balances.map((b) => (
        <Card key={b.leaveTypeId}>
          <CardContent className="flex flex-col gap-2 p-4">
            <div className="flex items-center gap-2">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: b.color }}
              />
              <span className="text-muted-foreground text-sm">
                {b.leaveTypeName}
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-semibold tabular-nums">
                {b.paid ? b.availableDays : "—"}
              </span>
              {b.paid && (
                <span className="text-muted-foreground text-xs">
                  / {b.entitledDays + b.carriedForwardDays + b.adjustmentDays} days
                </span>
              )}
            </div>
            <div className="text-muted-foreground flex gap-3 text-xs">
              <span>{b.takenDays} taken</span>
              {b.pendingDays > 0 && <span>{b.pendingDays} pending</span>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
