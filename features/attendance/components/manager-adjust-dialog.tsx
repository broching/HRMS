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
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getErrorMessage } from "@/lib/errors"

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function toMs(date: string, time: string): number | undefined {
  if (!time) return undefined
  const ms = new Date(`${date}T${time}`).getTime()
  return Number.isNaN(ms) ? undefined : ms
}

export type AdjustPrefill = {
  employeeId?: string
  date?: string
  inTime?: string
  outTime?: string
}

/**
 * Manager/HR fallback for when the system was down: directly record an
 * employee's clock-in (and optional clock-out) for a day. Works standalone with
 * a `trigger`, or controlled (`open`/`onOpenChange` + `prefill`) so the
 * attendance calendar can open it pre-filled from a drag selection.
 */
export function ManagerAdjustDialog({
  trigger,
  open: openProp,
  onOpenChange,
  prefill,
}: {
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (o: boolean) => void
  prefill?: AdjustPrefill
}) {
  const employees = useQuery(api.schedules.schedulableEmployees) ?? []
  const adjust = useMutation(api.attendance.adjustRecord)

  const controlled = openProp !== undefined
  const [openState, setOpenState] = React.useState(false)
  const open = controlled ? openProp : openState
  const setOpen = React.useCallback(
    (o: boolean) => {
      if (!controlled) setOpenState(o)
      onOpenChange?.(o)
    },
    [controlled, onOpenChange],
  )

  const [employeeId, setEmployeeId] = React.useState("")
  const [date, setDate] = React.useState(todayISO())
  const [inTime, setInTime] = React.useState("")
  const [outTime, setOutTime] = React.useState("")
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  // Seed fields from the prefill each time the dialog opens.
  React.useEffect(() => {
    if (!open || !prefill) return
    if (prefill.employeeId !== undefined) setEmployeeId(prefill.employeeId)
    setDate(prefill.date ?? todayISO())
    setInTime(prefill.inTime ?? "")
    setOutTime(prefill.outTime ?? "")
  }, [open, prefill])

  async function submit() {
    const clockInAt = toMs(date, inTime)
    if (!employeeId) {
      toast.error("Pick an employee.")
      return
    }
    if (!clockInAt) {
      toast.error("Enter a clock-in time.")
      return
    }
    setBusy(true)
    try {
      await adjust({
        employeeId: employeeId as Id<"employees">,
        date,
        clockInAt,
        clockOutAt: toMs(date, outTime),
        note: note.trim() || undefined,
      })
      toast.success("Attendance recorded")
      setOpen(false)
      setInTime("")
      setOutTime("")
      setNote("")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't record attendance"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust attendance</DialogTitle>
          <DialogDescription>
            Record clock-in/out on someone&apos;s behalf when they couldn&apos;t
            scan (e.g. the system was down).
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Employee</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select employee" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e._id} value={e._id}>
                    {e.name}
                    {e.positionTitle ? ` · ${e.positionTitle}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adj-date">Date</Label>
            <Input
              id="adj-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adj-in">Clock-in time</Label>
              <Input
                id="adj-in"
                type="time"
                value={inTime}
                onChange={(e) => setInTime(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adj-out">Clock-out time</Label>
              <Input
                id="adj-out"
                type="time"
                value={outTime}
                onChange={(e) => setOutTime(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adj-note">Note (optional)</Label>
            <Textarea
              id="adj-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. QR scanner was offline all morning."
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Record attendance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
