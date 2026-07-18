"use client"

import { getErrorMessage } from "@/lib/errors"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export type EditingShift = {
  _id: Id<"shiftAssignments">
  startTime: string
  endTime: string
  breakMinutes: number
  note: string | null
}

export function AssignShiftDialog({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  date,
  existing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  employeeId: Id<"employees">
  employeeName: string
  date: string
  existing?: EditingShift
}) {
  const templates = useQuery(api.shiftTemplates.list)
  const assign = useMutation(api.schedules.assign)
  const update = useMutation(api.schedules.updateAssignment)
  const remove = useMutation(api.schedules.removeAssignment)

  const [templateId, setTemplateId] = React.useState<string>("custom")
  const [startTime, setStartTime] = React.useState("09:00")
  const [endTime, setEndTime] = React.useState("17:00")
  const [breakMinutes, setBreakMinutes] = React.useState("60")
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  // Reset the form whenever the dialog (re)opens for a different context.
  React.useEffect(() => {
    if (!open) return
    if (existing) {
      setTemplateId("custom")
      setStartTime(existing.startTime)
      setEndTime(existing.endTime)
      setBreakMinutes(String(existing.breakMinutes))
      setNote(existing.note ?? "")
    } else {
      setTemplateId("custom")
      setStartTime("09:00")
      setEndTime("17:00")
      setBreakMinutes("60")
      setNote("")
    }
  }, [open, existing])

  function pickTemplate(id: string) {
    setTemplateId(id)
    if (id === "custom") return
    const tpl = templates?.find((t) => t._id === id)
    if (tpl) {
      setStartTime(tpl.startTime)
      setEndTime(tpl.endTime)
      setBreakMinutes(String(tpl.breakMinutes))
    }
  }

  async function submit() {
    setBusy(true)
    try {
      if (existing) {
        await update({
          id: existing._id,
          startTime,
          endTime,
          breakMinutes: Number(breakMinutes) || 0,
          note,
        })
        toast.success("Shift updated")
      } else {
        await assign({
          employeeId,
          date,
          shiftTemplateId:
            templateId === "custom"
              ? undefined
              : (templateId as Id<"shiftTemplates">),
          startTime,
          endTime,
          breakMinutes: Number(breakMinutes) || 0,
          note: note || undefined,
        })
        toast.success("Shift added")
      }
      onOpenChange(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save"))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!existing) return
    setBusy(true)
    try {
      await remove({ id: existing._id })
      toast.success("Shift removed")
      onOpenChange(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't remove"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? "Edit shift" : "Add shift"}</DialogTitle>
          <DialogDescription>
            {employeeName} · {date}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {!existing && (
            <div className="flex flex-col gap-1.5">
              <Label>Shift template</Label>
              <Select value={templateId} onValueChange={pickTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Custom times" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Custom times</SelectItem>
                  {templates?.map((t) => (
                    <SelectItem key={t._id} value={t._id}>
                      {t.name} ({t.startTime}–{t.endTime})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-start">Start</Label>
              <Input
                id="s-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-end">End</Label>
              <Input
                id="s-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-break">Break (m)</Label>
              <Input
                id="s-break"
                inputMode="numeric"
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-note">Note</Label>
            <Textarea
              id="s-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Optional"
            />
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          {existing ? (
            <Button variant="ghost" onClick={handleDelete} disabled={busy}>
              Remove
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={submit} disabled={busy}>
            {existing ? "Save" : "Add shift"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
