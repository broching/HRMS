"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { toast } from "sonner"
import {
  IconPencil,
  IconLogin2,
  IconLogout2,
  IconCheck,
  IconX,
  IconInbox,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import { getErrorMessage } from "@/lib/errors"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { AttendanceCalendar } from "@/features/attendance/components/attendance-calendar"
import { ManagerAdjustDialog } from "@/features/attendance/components/manager-adjust-dialog"
import { formatTime, formatDay } from "@/features/attendance/lib/labels"

type Correction = FunctionReturnType<
  typeof api.attendance.correctionQueue
>[number]

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")
}

export function TeamAttendance({ scope = "team" }: { scope?: "team" | "org" }) {
  const corrections = useQuery(api.attendance.correctionQueue)
  const review = useMutation(api.attendance.reviewCorrection)
  // The correction pending a confirm, plus the decision being confirmed.
  const [pending, setPending] = React.useState<{
    correction: Correction
    approve: boolean
  } | null>(null)

  async function confirmDecision() {
    if (!pending) return
    const { correction, approve } = pending
    try {
      await review({ correctionId: correction._id, approve })
      toast.success(approve ? "Correction approved" : "Correction rejected")
    } catch (e) {
      toast.error(
        getErrorMessage(e, "We couldn't save your decision. Please try again."),
      )
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
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle>Correction requests</CardTitle>
                <CardDescription>Pending your review.</CardDescription>
              </div>
              {corrections && corrections.length > 0 && (
                <Badge variant="secondary" className="tabular-nums">
                  {corrections.length}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {corrections === undefined ? (
              <Skeleton className="h-24 w-full" />
            ) : corrections.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <IconInbox className="text-muted-foreground/40 size-8" />
                <p className="text-muted-foreground text-sm">
                  No pending corrections.
                </p>
              </div>
            ) : (
              corrections.map((c) => (
                <CorrectionCard
                  key={c._id}
                  correction={c}
                  onDecide={(approve) => setPending({ correction: c, approve })}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title={
          pending?.approve
            ? "Approve this correction?"
            : "Reject this correction?"
        }
        description={
          pending
            ? pending.approve
              ? `${pending.correction.employeeName}'s attendance for ${pending.correction.date} will be updated to the requested times.`
              : `${pending.correction.employeeName}'s request for ${pending.correction.date} will be dismissed with no change to their attendance.`
            : undefined
        }
        confirmLabel={pending?.approve ? "Approve" : "Reject"}
        destructive={pending ? !pending.approve : false}
        onConfirm={confirmDecision}
      />
    </div>
  )
}

function CorrectionCard({
  correction: c,
  onDecide,
}: {
  correction: Correction
  onDecide: (approve: boolean) => void
}) {
  return (
    <div className="hover:border-border flex flex-col gap-3 rounded-lg border p-3 transition-colors">
      <div className="flex items-start gap-3">
        <Avatar className="size-8 shrink-0">
          <AvatarFallback className="text-[11px] font-medium">
            {initials(c.employeeName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium">
              {c.employeeName}
            </span>
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {c.date}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {c.requestedClockInAt != null && (
              <RequestChip
                icon={<IconLogin2 className="size-3" />}
                label="In"
                ms={c.requestedClockInAt}
              />
            )}
            {c.requestedClockOutAt != null && (
              <RequestChip
                icon={<IconLogout2 className="size-3" />}
                label="Out"
                ms={c.requestedClockOutAt}
              />
            )}
          </div>
          {c.reason && (
            <p className="text-muted-foreground mt-2 text-sm">
              &ldquo;{c.reason}&rdquo;
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-2 pl-11">
        <Button size="sm" className="flex-1" onClick={() => onDecide(true)}>
          <IconCheck className="size-4" />
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={() => onDecide(false)}
        >
          <IconX className="size-4" />
          Reject
        </Button>
      </div>
    </div>
  )
}

function RequestChip({
  icon,
  label,
  ms,
}: {
  icon: React.ReactNode
  label: string
  ms: number
}) {
  return (
    <span className="bg-muted text-foreground/80 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs">
      {icon}
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">
        {formatDay(ms)} {formatTime(ms)}
      </span>
    </span>
  )
}
