"use client"

import { getErrorMessage } from "@/lib/errors"
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
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatDayLabel } from "@/features/timesheets/lib/time"

export type EditingShift = {
  _id: Id<"shiftAssignments">
  startTime: string
  endTime: string
  breakMinutes: number
  note: string | null
}

export type EditingOvertime = {
  _id: Id<"overtimeRecords">
  startTime: string
  endTime: string
  multiplier: number
  note: string | null
}

type BlockType = "shift" | "overtime"

export function ShiftEditorDialog({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  date,
  existingShift,
  existingOvertime,
  defaultType = "shift",
  defaultStart,
  defaultEnd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  employeeId: Id<"employees">
  employeeName: string
  date: string
  existingShift?: EditingShift
  existingOvertime?: EditingOvertime
  defaultType?: BlockType
  defaultStart?: string
  defaultEnd?: string
}) {
  const assign = useMutation(api.schedules.assign)
  const updateShift = useMutation(api.schedules.updateAssignment)
  const removeShift = useMutation(api.schedules.removeAssignment)
  const scheduleOt = useMutation(api.overtime.schedule)
  const updateOt = useMutation(api.overtime.update)
  const cancelOt = useMutation(api.overtime.cancel)

  const editing = existingShift ?? existingOvertime
  const editingType: BlockType | null = existingShift
    ? "shift"
    : existingOvertime
      ? "overtime"
      : null

  const [type, setType] = React.useState<BlockType>(defaultType)
  const [startTime, setStartTime] = React.useState("09:00")
  const [endTime, setEndTime] = React.useState("17:00")
  const [breakMinutes, setBreakMinutes] = React.useState("60")
  const [multiplier, setMultiplier] = React.useState("1.5")
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    if (existingShift) {
      setType("shift")
      setStartTime(existingShift.startTime)
      setEndTime(existingShift.endTime)
      setBreakMinutes(String(existingShift.breakMinutes))
      setNote(existingShift.note ?? "")
    } else if (existingOvertime) {
      setType("overtime")
      setStartTime(existingOvertime.startTime)
      setEndTime(existingOvertime.endTime)
      setMultiplier(String(existingOvertime.multiplier))
      setNote(existingOvertime.note ?? "")
    } else {
      setType(defaultType)
      setStartTime(defaultStart ?? (defaultType === "overtime" ? "18:00" : "09:00"))
      setEndTime(defaultEnd ?? (defaultType === "overtime" ? "20:00" : "17:00"))
      setBreakMinutes("60")
      setMultiplier("1.5")
      setNote("")
    }
  }, [open, existingShift, existingOvertime, defaultType, defaultStart, defaultEnd])

  async function submit() {
    setBusy(true)
    try {
      if (existingShift) {
        await updateShift({
          id: existingShift._id,
          startTime,
          endTime,
          breakMinutes: Number(breakMinutes) || 0,
          note,
        })
        toast.success("Shift updated")
      } else if (existingOvertime) {
        await updateOt({
          overtimeId: existingOvertime._id,
          startTime,
          endTime,
          multiplier: Number(multiplier) || undefined,
          note,
        })
        toast.success("Overtime updated")
      } else if (type === "shift") {
        await assign({
          employeeId,
          date,
          startTime,
          endTime,
          breakMinutes: Number(breakMinutes) || 0,
          note: note || undefined,
        })
        toast.success("Shift added")
      } else {
        await scheduleOt({
          employeeId,
          date,
          startTime,
          endTime,
          multiplier: Number(multiplier) || undefined,
          note: note || undefined,
        })
        toast.success("Overtime scheduled")
      }
      onOpenChange(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save"))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    try {
      if (existingShift) {
        await removeShift({ id: existingShift._id })
        toast.success("Shift removed")
      } else if (existingOvertime) {
        await cancelOt({ overtimeId: existingOvertime._id })
        toast.success("Overtime cancelled")
      }
      onOpenChange(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't remove"))
    } finally {
      setBusy(false)
    }
  }

  const title = editing
    ? editingType === "overtime"
      ? "Edit overtime"
      : "Edit shift"
    : "Add to roster"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {employeeName} · {formatDayLabel(date)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {!editing && (
            <ToggleGroup
              type="single"
              value={type}
              onValueChange={(v) => v && setType(v as BlockType)}
              className="w-full"
            >
              <ToggleGroupItem value="shift" className="flex-1">
                Shift
              </ToggleGroupItem>
              <ToggleGroupItem value="overtime" className="flex-1">
                Overtime
              </ToggleGroupItem>
            </ToggleGroup>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="se-start">Start</Label>
              <Input
                id="se-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="se-end">End</Label>
              <Input
                id="se-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
            {type === "shift" ? (
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="se-break">Break (m)</Label>
                <Input
                  id="se-break"
                  inputMode="numeric"
                  value={breakMinutes}
                  onChange={(e) => setBreakMinutes(e.target.value)}
                />
              </div>
            ) : (
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="se-mult">Rate (×)</Label>
                <Input
                  id="se-mult"
                  inputMode="decimal"
                  value={multiplier}
                  onChange={(e) => setMultiplier(e.target.value)}
                />
              </div>
            )}
          </div>

          {type === "overtime" && (
            <p className="text-muted-foreground text-xs">
              Overtime pays at {multiplier || "1.5"}× the hourly rate. For
              salaried staff the hourly rate is derived from base pay.
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="se-note">Note</Label>
            <Textarea
              id="se-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Optional"
            />
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          {editing ? (
            <Button variant="ghost" onClick={handleDelete} disabled={busy}>
              {editingType === "overtime" ? "Cancel OT" : "Remove"}
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={submit} disabled={busy}>
            {editing ? "Save" : type === "overtime" ? "Schedule OT" : "Add shift"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
