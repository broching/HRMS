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
import { getErrorMessage } from "@/lib/errors"

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

export function ScheduleOvertimeDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const employees = useQuery(api.schedules.schedulableEmployees) ?? []
  const settings = useQuery(api.attendanceSettings.get)
  const schedule = useMutation(api.overtime.schedule)

  const [employeeId, setEmployeeId] = React.useState("")
  const [date, setDate] = React.useState(todayIso())
  const [hours, setHours] = React.useState("2")
  const [multiplier, setMultiplier] = React.useState("")
  const [note, setNote] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  // Seed the multiplier from the org default once settings load.
  React.useEffect(() => {
    if (settings && !multiplier) {
      setMultiplier(String(settings.defaultOvertimeMultiplier))
    }
  }, [settings, multiplier])

  async function submit() {
    if (!employeeId) {
      toast.error("Pick an employee.")
      return
    }
    const h = parseFloat(hours)
    const m = parseFloat(multiplier)
    if (!Number.isFinite(h) || h <= 0) {
      toast.error("Enter valid overtime hours.")
      return
    }
    setSaving(true)
    try {
      await schedule({
        employeeId: employeeId as Id<"employees">,
        date,
        plannedHours: h,
        multiplier: Number.isFinite(m) && m > 0 ? m : undefined,
        note: note.trim() || undefined,
      })
      toast.success("Overtime scheduled")
      onOpenChange(false)
      setEmployeeId("")
      setNote("")
      setHours("2")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't schedule overtime"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule overtime</DialogTitle>
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
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ot-date">Date</Label>
              <Input
                id="ot-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ot-hours">Hours</Label>
              <Input
                id="ot-hours"
                type="number"
                step="0.5"
                min="0"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ot-mult">Multiplier</Label>
              <Input
                id="ot-mult"
                type="number"
                step="0.1"
                min="0"
                value={multiplier}
                onChange={(e) => setMultiplier(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ot-note">Note (optional)</Label>
            <Textarea
              id="ot-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason or context…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Scheduling…" : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
