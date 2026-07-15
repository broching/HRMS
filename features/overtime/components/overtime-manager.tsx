"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { toast } from "sonner"
import { IconPlus } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { getErrorMessage } from "@/lib/errors"
import { ScheduleOvertimeDialog } from "./schedule-overtime-dialog"
import {
  OVERTIME_STATUS_CLASSES,
  OVERTIME_STATUS_LABELS,
  formatOvertimeDate,
} from "@/features/overtime/lib/labels"

type Row = FunctionReturnType<typeof api.overtime.reviewList>[number]

function StatusPill({ status, paid }: { status: Row["status"]; paid: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[11px] font-medium",
          OVERTIME_STATUS_CLASSES[status],
        )}
      >
        {OVERTIME_STATUS_LABELS[status]}
      </span>
      {paid && (
        <span className="text-muted-foreground text-[11px]">· paid</span>
      )}
    </span>
  )
}

function OvertimeRow({ row }: { row: Row }) {
  const approve = useMutation(api.overtime.approve)
  const reject = useMutation(api.overtime.reject)
  const cancel = useMutation(api.overtime.cancel)
  const [actual, setActual] = React.useState(String(row.plannedHours))
  const [busy, setBusy] = React.useState(false)

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true)
    try {
      await fn()
      toast.success(ok)
    } catch (e) {
      toast.error(getErrorMessage(e, "Something went wrong. Please try again."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{row.employeeName}</span>
        <StatusPill status={row.status} paid={row.paid} />
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span>{formatOvertimeDate(row.date)}</span>
        <span>
          {(row.actualHours ?? row.plannedHours)}h × {row.multiplier}
        </span>
      </div>
      {row.note && <p className="text-sm">{row.note}</p>}

      {row.status === "scheduled" && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
            Actual hrs
            <Input
              type="number"
              step="0.5"
              min="0"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              className="h-8 w-20"
            />
          </label>
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  approve({
                    overtimeId: row._id,
                    actualHours: parseFloat(actual) || row.plannedHours,
                  }),
                "Overtime approved",
              )
            }
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => run(() => reject({ overtimeId: row._id }), "Rejected")}
          >
            Reject
          </Button>
        </div>
      )}
      {(row.status === "scheduled" || row.status === "approved") && !row.paid && (
        <div>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground h-7 px-2"
            disabled={busy}
            onClick={() => run(() => cancel({ overtimeId: row._id }), "Cancelled")}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  )
}

export function OvertimeManager() {
  const rows = useQuery(api.overtime.reviewList)
  const [scheduleOpen, setScheduleOpen] = React.useState(false)

  const pending = rows?.filter((r) => r.status === "scheduled") ?? []
  const decided = rows?.filter((r) => r.status !== "scheduled") ?? []

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <div className="flex justify-end">
        <Button onClick={() => setScheduleOpen(true)}>
          <IconPlus className="size-4" />
          Schedule overtime
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Awaiting approval</CardTitle>
            <CardDescription>
              Scheduled overtime to confirm once worked.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {rows === undefined ? (
              <Skeleton className="h-24 w-full" />
            ) : pending.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nothing awaiting approval.
              </p>
            ) : (
              pending.map((r) => <OvertimeRow key={r._id} row={r} />)
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
            <CardDescription>Approved, rejected and cancelled.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {rows === undefined ? (
              <Skeleton className="h-24 w-full" />
            ) : decided.length === 0 ? (
              <p className="text-muted-foreground text-sm">No history yet.</p>
            ) : (
              decided.map((r) => <OvertimeRow key={r._id} row={r} />)
            )}
          </CardContent>
        </Card>
      </div>

      <ScheduleOvertimeDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
      />
    </div>
  )
}
