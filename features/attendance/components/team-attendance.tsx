"use client"

import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import { IconPencil } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { getErrorMessage } from "@/lib/errors"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { AttendanceCalendar } from "@/features/attendance/components/attendance-calendar"
import { ManagerAdjustDialog } from "@/features/attendance/components/manager-adjust-dialog"
import { formatTime, formatDay } from "@/features/attendance/lib/labels"

function correctionLine(label: string, ms: number | null): string | null {
  if (ms == null) return null
  return `${label} ${formatDay(ms)} ${formatTime(ms)}`
}

export function TeamAttendance({ scope = "team" }: { scope?: "team" | "org" }) {
  const corrections = useQuery(api.attendance.correctionQueue)
  const review = useMutation(api.attendance.reviewCorrection)

  async function decide(correctionId: Id<"attendanceCorrections">, approve: boolean) {
    try {
      await review({ correctionId, approve })
      toast.success(approve ? "Correction approved" : "Correction rejected")
    } catch (e) {
      toast.error(getErrorMessage(e, "We couldn't save your decision. Please try again."))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end px-4 lg:px-6">
        <ManagerAdjustDialog
          trigger={
            <Button variant="outline" size="sm">
              <IconPencil className="size-4" />
              Adjust attendance
            </Button>
          }
        />
      </div>

      <AttendanceCalendar scope={scope} />

      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle>Correction requests</CardTitle>
            <CardDescription>Pending your review.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {corrections === undefined ? (
              <Skeleton className="h-20 w-full" />
            ) : corrections.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No pending corrections.
              </p>
            ) : (
              corrections.map((c) => (
                <div key={c._id} className="flex flex-col gap-2 rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{c.employeeName}</span>
                    <span className="text-muted-foreground text-xs">{c.date}</span>
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {[
                      correctionLine("In →", c.requestedClockInAt),
                      correctionLine("Out →", c.requestedClockOutAt),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  <p className="text-sm">{c.reason}</p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => decide(c._id, true)}>
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => decide(c._id, false)}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
