"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function ModifyLeaveDialog({
  requestId,
  open,
  onOpenChange,
  initial,
}: {
  requestId: Id<"leaveRequests">
  open: boolean
  onOpenChange: (open: boolean) => void
  initial: {
    leaveTypeId: Id<"leaveTypes">
    startDate: string
    endDate: string
    reason: string
  }
}) {
  const leaveTypes = useQuery(api.leaveTypes.list, {}) ?? []
  const modify = useMutation(api.leaveRequests.modify)

  const [leaveTypeId, setLeaveTypeId] = React.useState<string>(initial.leaveTypeId)
  const [startDate, setStartDate] = React.useState(initial.startDate)
  const [endDate, setEndDate] = React.useState(initial.endDate)
  const [reason, setReason] = React.useState(initial.reason)
  const [busy, setBusy] = React.useState(false)

  // Re-sync when opening on a different request.
  React.useEffect(() => {
    if (open) {
      setLeaveTypeId(initial.leaveTypeId)
      setStartDate(initial.startDate)
      setEndDate(initial.endDate)
      setReason(initial.reason)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function handleSave() {
    if (endDate < startDate) return toast.error("End date is before start date.")
    setBusy(true)
    try {
      await modify({
        requestId,
        leaveTypeId: leaveTypeId as Id<"leaveTypes">,
        startDate,
        endDate,
        reason: reason.trim() || undefined,
      })
      toast.success("Leave updated")
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Modify leave</DialogTitle>
          <DialogDescription>
            Days are recomputed and balances adjusted automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Leave type</Label>
            <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {leaveTypes.map((t) => (
                  <SelectItem key={t._id} value={t._id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Start date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>End date</Label>
              <Input
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Justification</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
