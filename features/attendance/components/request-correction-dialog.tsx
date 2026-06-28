"use client"

import * as React from "react"
import { useMutation } from "convex/react"
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
  DialogTrigger,
} from "@/components/ui/dialog"

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// Combine an ISO date + "HH:MM" time into epoch ms (local), or undefined.
function toMs(date: string, time: string): number | undefined {
  if (!time) return undefined
  const ms = new Date(`${date}T${time}`).getTime()
  return Number.isNaN(ms) ? undefined : ms
}

export function RequestCorrectionDialog({
  trigger,
  recordId,
  defaultDate,
}: {
  trigger: React.ReactNode
  recordId?: Id<"attendanceRecords">
  defaultDate?: string
}) {
  const request = useMutation(api.attendance.requestCorrection)
  const [open, setOpen] = React.useState(false)
  const [date, setDate] = React.useState(defaultDate ?? todayISO())
  const [inTime, setInTime] = React.useState("")
  const [outTime, setOutTime] = React.useState("")
  const [reason, setReason] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function submit() {
    const requestedClockInAt = toMs(date, inTime)
    const requestedClockOutAt = toMs(date, outTime)
    if (!requestedClockInAt && !requestedClockOutAt) {
      toast.error("Enter a corrected clock-in or clock-out time.")
      return
    }
    setBusy(true)
    try {
      await request({
        recordId,
        date,
        requestedClockInAt,
        requestedClockOutAt,
        reason,
      })
      toast.success("Correction requested")
      setOpen(false)
      setInTime("")
      setOutTime("")
      setReason("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't submit")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request attendance correction</DialogTitle>
          <DialogDescription>
            Forgot to clock in or out? Send a correction for your manager to
            review.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="corr-date">Date</Label>
            <Input
              id="corr-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="corr-in">Clock-in time</Label>
              <Input
                id="corr-in"
                type="time"
                value={inTime}
                onChange={(e) => setInTime(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="corr-out">Clock-out time</Label>
              <Input
                id="corr-out"
                type="time"
                value={outTime}
                onChange={(e) => setOutTime(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="corr-reason">Reason</Label>
            <Textarea
              id="corr-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Forgot to clock out after my shift."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || !reason.trim()}>
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
