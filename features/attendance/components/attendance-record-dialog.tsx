"use client"

import * as React from "react"
import { useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { toast } from "sonner"
import {
  IconPencil,
  IconTrash,
  IconMapPin,
  IconClockHour4,
  IconDeviceMobile,
  IconNote,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
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
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { getErrorMessage } from "@/lib/errors"
import {
  ATTENDANCE_STATUS_BADGE,
  ATTENDANCE_STATUS_LABELS,
  formatDay,
  formatTime,
  formatDuration,
} from "@/features/attendance/lib/labels"

type Block =
  FunctionReturnType<
    typeof api.attendance.attendanceDayBoard
  >["people"][number]["blocks"][number]

const METHOD_LABELS: Record<Block["method"], string> = {
  qr_gps: "QR scan + GPS",
  manual: "Added manually",
}

function pad(n: number) {
  return String(n).padStart(2, "0")
}
function msToDateInput(ms: number) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function msToTimeInput(ms: number) {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function toMs(date: string, time: string): number | undefined {
  if (!time) return undefined
  const ms = new Date(`${date}T${time}`).getTime()
  return Number.isNaN(ms) ? undefined : ms
}

/**
 * Detail view for a single attendance session on the day board. Shows the clock
 * times, office, capture method and note; managers can switch to edit the times
 * or delete the record outright (both go through server-side permission checks).
 */
export function AttendanceRecordDialog({
  open,
  onOpenChange,
  block,
  employeeId,
  employeeName,
  date,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  block: Block | null
  employeeId: Id<"employees">
  employeeName: string
  date: string
}) {
  const adjust = useMutation(api.attendance.adjustRecord)
  const remove = useMutation(api.attendance.deleteRecord)

  const [editing, setEditing] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const [editDate, setEditDate] = React.useState("")
  const [inTime, setInTime] = React.useState("")
  const [outTime, setOutTime] = React.useState("")
  const [note, setNote] = React.useState("")

  // Seed the edit form from the block whenever the dialog (re)opens.
  React.useEffect(() => {
    if (!open || !block) return
    setEditing(false)
    setEditDate(msToDateInput(block.clockInAt))
    setInTime(msToTimeInput(block.clockInAt))
    setOutTime(block.clockOutAt != null ? msToTimeInput(block.clockOutAt) : "")
    setNote(block.note ?? "")
  }, [open, block])

  if (!block) return null

  async function save() {
    const clockInAt = toMs(editDate, inTime)
    if (!clockInAt) {
      toast.error("Enter a clock-in time.")
      return
    }
    const clockOutAt = toMs(editDate, outTime)
    if (clockOutAt != null && clockOutAt < clockInAt) {
      toast.error("Clock-out can't be before clock-in.")
      return
    }
    setBusy(true)
    try {
      await adjust({
        recordId: block!._id,
        employeeId,
        // Use the edited date so moving a session to another day relocates it.
        date: editDate,
        clockInAt,
        clockOutAt,
        note: note.trim() || undefined,
      })
      toast.success("Attendance updated")
      setEditing(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't update this record"))
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    try {
      await remove({ recordId: block!._id })
      toast.success("Attendance record deleted")
      onOpenChange(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't delete this record"))
    }
  }

  const worked =
    block.workedMinutes ??
    (block.clockOutAt != null
      ? Math.round((block.clockOutAt - block.clockInAt) / 60000)
      : null)

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {employeeName}
              <Badge variant={ATTENDANCE_STATUS_BADGE[block.status]}>
                {ATTENDANCE_STATUS_LABELS[block.status]}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              {formatDay(block.clockInAt)}
            </DialogDescription>
          </DialogHeader>

          {editing ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rec-date">Date</Label>
                <Input
                  id="rec-date"
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="rec-in">Clock-in</Label>
                  <Input
                    id="rec-in"
                    type="time"
                    value={inTime}
                    onChange={(e) => setInTime(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="rec-out">Clock-out</Label>
                  <Input
                    id="rec-out"
                    type="time"
                    value={outTime}
                    onChange={(e) => setOutTime(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-muted-foreground text-xs">
                Leave clock-out empty to mark the session still open.
              </p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="rec-note">Note</Label>
                <Textarea
                  id="rec-note"
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Reason for the adjustment"
                />
              </div>
            </div>
          ) : (
            <dl className="flex flex-col divide-y text-sm">
              <DetailRow
                icon={<IconClockHour4 className="size-4" />}
                label="Clock-in"
                value={formatTime(block.clockInAt)}
              />
              <DetailRow
                icon={<IconClockHour4 className="size-4" />}
                label="Clock-out"
                value={
                  block.clockOutAt != null
                    ? formatTime(block.clockOutAt)
                    : "Still clocked in"
                }
              />
              <DetailRow
                icon={<IconClockHour4 className="size-4" />}
                label="Worked"
                value={worked != null ? formatDuration(worked) : "In progress"}
              />
              <DetailRow
                icon={<IconMapPin className="size-4" />}
                label="Office"
                value={block.officeName ?? "—"}
              />
              <DetailRow
                icon={<IconDeviceMobile className="size-4" />}
                label="Method"
                value={METHOD_LABELS[block.method]}
              />
              {block.clockInDistance != null && (
                <DetailRow
                  icon={<IconMapPin className="size-4" />}
                  label="Distance"
                  value={`${Math.round(block.clockInDistance)} m from office`}
                />
              )}
              {block.note && (
                <DetailRow
                  icon={<IconNote className="size-4" />}
                  label="Note"
                  value={block.note}
                />
              )}
            </dl>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            {editing ? (
              <>
                <Button
                  variant="ghost"
                  onClick={() => setEditing(false)}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button onClick={save} disabled={busy}>
                  {busy ? "Saving…" : "Save changes"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <IconTrash className="size-4" />
                  Delete
                </Button>
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <IconPencil className="size-4" />
                  Edit
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete attendance record?"
        description={`This removes ${employeeName}'s ${formatDay(
          block.clockInAt,
        )} session (${formatTime(block.clockInAt)}${
          block.clockOutAt != null ? `–${formatTime(block.clockOutAt)}` : ""
        }). This can't be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </>
  )
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <dt className="text-muted-foreground flex items-center gap-2">
        {icon}
        {label}
      </dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  )
}
