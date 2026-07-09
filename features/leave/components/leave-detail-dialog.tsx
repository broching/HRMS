"use client"

import type { LeaveStatus } from "@/convex/lib/enums"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import {
  formatRange,
  LEAVE_STATUS_BADGE,
  LEAVE_STATUS_LABELS,
} from "@/features/leave-admin/lib/labels"

/** Minimal shape shared by every leave calendar row (see `leaveRequests.calendar`). */
export type LeaveDetailRow = {
  employeeName: string
  employeePhotoUrl?: string | null
  leaveTypeName: string
  leaveTypeColor: string
  startDate: string
  endDate: string
  totalDays: number
  status: LeaveStatus
  reason?: string
}

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {label}
      </span>
      <div className="text-sm">{children}</div>
    </div>
  )
}

export function LeaveDetailDialog({
  leave,
  onOpenChange,
}: {
  leave: LeaveDetailRow | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={leave !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {leave && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <Avatar className="size-10">
                  <AvatarImage src={leave.employeePhotoUrl ?? undefined} />
                  <AvatarFallback className="text-xs">
                    {initials(leave.employeeName)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col text-left">
                  <DialogTitle>{leave.employeeName}</DialogTitle>
                  <span className="flex items-center gap-1.5 text-sm">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: leave.leaveTypeColor }}
                    />
                    <span className="text-muted-foreground">
                      {leave.leaveTypeName}
                    </span>
                  </span>
                </div>
              </div>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Dates">
                {formatRange(leave.startDate, leave.endDate)}
              </Field>
              <Field label="Duration">
                {leave.totalDays} {leave.totalDays === 1 ? "day" : "days"}
              </Field>
              <Field label="Status">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                    LEAVE_STATUS_BADGE[leave.status],
                  )}
                >
                  {LEAVE_STATUS_LABELS[leave.status]}
                </span>
              </Field>
              <Field label="Leave type">{leave.leaveTypeName}</Field>
            </div>

            {leave.reason && (
              <Field label="Reason">
                <p className="text-muted-foreground whitespace-pre-wrap">
                  {leave.reason}
                </p>
              </Field>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
