"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

const today = () => new Date().toISOString().slice(0, 10)

export function OnLeaveToday() {
  const t = today()
  const onLeave = useQuery(api.leaveRequests.calendar, { start: t, end: t })

  return (
    <Card>
      <CardHeader>
        <CardTitle>On leave today</CardTitle>
      </CardHeader>
      <CardContent>
        {onLeave === undefined ? (
          <Skeleton className="h-6 w-full" />
        ) : onLeave.length === 0 ? (
          <p className="text-muted-foreground text-sm">No one is on leave today.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {onLeave.map((r) => (
              <li key={r._id} className="flex items-center gap-2 text-sm">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: r.leaveTypeColor }}
                />
                <span className="font-medium">{r.employeeName}</span>
                <span className="text-muted-foreground">{r.leaveTypeName}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
