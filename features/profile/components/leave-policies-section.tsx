"use client"

import { getErrorMessage } from "@/lib/errors"
import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { IconAdjustmentsHorizontal, IconHistory } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { permitted } from "@/convex/lib/permissions"
import { useCurrentMember } from "@/hooks/use-current-member"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type Balance = {
  leaveTypeId: Id<"leaveTypes">
  leaveTypeName: string
  color: string
}

function fmtDelta(n: number) {
  return `${n > 0 ? "+" : ""}${n}`
}

function fmtWhen(ms: number) {
  return new Date(ms).toLocaleString("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export function LeavePoliciesSection({
  employeeId,
}: {
  employeeId: Id<"employees">
}) {
  const member = useCurrentMember()
  const canManage = permitted(member?.permissions, "leave:config")
  const year = new Date().getFullYear()

  const balances = useQuery(api.leaveBalances.forEmployee, { employeeId })
  const history = useQuery(
    api.leaveBalances.adjustmentHistory,
    canManage ? { employeeId, year } : "skip",
  )
  const adjust = useMutation(api.leaveBalances.adjustEntitlement)

  const [target, setTarget] = React.useState<Balance | null>(null)

  if (balances === undefined) {
    return <Skeleton className="h-32 w-full rounded-lg" />
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Leave policies</h2>
        <span className="text-muted-foreground text-sm">{year}</span>
      </div>

      {balances.length === 0 ? (
        <p className="text-muted-foreground text-sm">No leave types configured.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs uppercase">
                <th className="py-2 pr-4 font-medium">Leave type</th>
                <th className="py-2 pr-4 text-right font-medium">Entitled</th>
                <th className="py-2 pr-4 text-right font-medium">Carried</th>
                <th className="py-2 pr-4 text-right font-medium">Taken</th>
                <th className="py-2 pr-4 text-right font-medium">Pending</th>
                <th className="py-2 pr-4 text-right font-medium">Available</th>
                {canManage && <th className="py-2 font-medium" />}
              </tr>
            </thead>
            <tbody>
              {balances.map((b) => (
                <tr key={b.leaveTypeId} className="border-b last:border-0">
                  <td className="py-2 pr-4">
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: b.color }}
                      />
                      {b.leaveTypeName}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {b.entitledDays + b.adjustmentDays}
                    {b.adjustmentDays !== 0 && (
                      <span className="text-muted-foreground ml-1 text-xs">
                        ({fmtDelta(b.adjustmentDays)})
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {b.carriedForwardDays}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{b.takenDays}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{b.pendingDays}</td>
                  <td className="py-2 pr-4 text-right font-medium tabular-nums">
                    {b.availableDays}
                  </td>
                  {canManage && (
                    <td className="py-2 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setTarget({
                            leaveTypeId: b.leaveTypeId,
                            leaveTypeName: b.leaveTypeName,
                            color: b.color,
                          })
                        }
                      >
                        <IconAdjustmentsHorizontal className="size-4" />
                        Adjust
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && history && history.length > 0 && (
        <div className="mt-2 flex flex-col gap-3">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <IconHistory className="size-4" /> Adjustment history
          </h3>
          <ol className="flex flex-col gap-2">
            {history.map((h) => (
              <li
                key={h._id}
                className="flex items-start gap-3 rounded-md border p-3 text-sm"
              >
                <span
                  className="mt-1 size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: h.color }}
                />
                <div className="flex min-w-0 flex-col">
                  <span>
                    <span className="font-medium tabular-nums">
                      {fmtDelta(h.deltaDays)} day
                      {Math.abs(h.deltaDays) === 1 ? "" : "s"}
                    </span>{" "}
                    to {h.leaveTypeName}
                    <span className="text-muted-foreground">
                      {" "}
                      (now {fmtDelta(h.newAdjustmentDays)})
                    </span>
                  </span>
                  {h.reason && (
                    <span className="text-muted-foreground">{h.reason}</span>
                  )}
                  <span className="text-muted-foreground text-xs">
                    {h.actorName ?? "Someone"} · {fmtWhen(h.at)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <AdjustDialog
        year={year}
        target={target}
        onClose={() => setTarget(null)}
        onSubmit={async (deltaDays, reason) => {
          await adjust({
            employeeId,
            leaveTypeId: target!.leaveTypeId,
            year,
            deltaDays,
            reason,
          })
        }}
      />
    </section>
  )
}

function AdjustDialog({
  year,
  target,
  onClose,
  onSubmit,
}: {
  year: number
  target: Balance | null
  onClose: () => void
  onSubmit: (deltaDays: number, reason?: string) => Promise<void>
}) {
  const [delta, setDelta] = React.useState("")
  const [reason, setReason] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (target) {
      setDelta("")
      setReason("")
    }
  }, [target])

  async function submit() {
    const n = Number(delta)
    if (!delta || Number.isNaN(n) || n === 0) {
      toast.error("Enter a non-zero number of days (use - to deduct).")
      return
    }
    setSaving(true)
    try {
      await onSubmit(n, reason.trim() || undefined)
      toast.success("Balance adjusted")
      onClose()
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not adjust"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust {target?.leaveTypeName} balance</DialogTitle>
          <DialogDescription>
            Add or deduct days for {year}. This is recorded in the audit
            timeline below.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="adjust-delta">Adjustment (days)</Label>
            <Input
              id="adjust-delta"
              type="number"
              step="0.5"
              autoFocus
              placeholder="e.g. 2 or -1.5"
              value={delta}
              onChange={(e) => setDelta(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Use a negative number to deduct days.
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="adjust-reason">Reason</Label>
            <Textarea
              id="adjust-reason"
              placeholder="Why is this balance being adjusted?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Apply adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
