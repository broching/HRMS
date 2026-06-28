"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { IconPlus, IconPaperclip, IconCheck } from "@tabler/icons-react"
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
import { FileUpload } from "@/components/shared/file-upload"

const today = () => new Date().toISOString().slice(0, 10)
const HALF = [
  { value: "full", label: "Full day" },
  { value: "am", label: "Morning (AM)" },
  { value: "pm", label: "Afternoon (PM)" },
]

export function ApplyLeaveDialog() {
  const leaveTypes = useQuery(api.leaveTypes.list, {})
  const apply = useMutation(api.leaveRequests.apply)
  const generateUrl = useMutation(api.leaveRequests.generateUploadUrl)

  const [open, setOpen] = React.useState(false)
  const [leaveTypeId, setLeaveTypeId] = React.useState<string>("")
  const [startDate, setStartDate] = React.useState(today())
  const [endDate, setEndDate] = React.useState(today())
  const [startHalf, setStartHalf] = React.useState("full")
  const [endHalf, setEndHalf] = React.useState("full")
  const [reason, setReason] = React.useState("")
  const [attachment, setAttachment] = React.useState<{
    id: Id<"_storage">
    name: string
  } | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  const selected = leaveTypes?.find((t) => t._id === leaveTypeId)
  const singleDay = startDate === endDate

  function reset() {
    setLeaveTypeId("")
    setStartDate(today())
    setEndDate(today())
    setStartHalf("full")
    setEndHalf("full")
    setReason("")
    setAttachment(null)
  }

  async function submit() {
    if (!leaveTypeId) return toast.error("Choose a leave type")
    if (endDate < startDate) return toast.error("End date is before start date")
    if (selected?.requiresAttachment && !attachment)
      return toast.error("This leave type requires an attachment")
    setSubmitting(true)
    try {
      await apply({
        leaveTypeId: leaveTypeId as Id<"leaveTypes">,
        startDate,
        endDate,
        startHalf:
          selected?.allowHalfDay && startHalf !== "full"
            ? (startHalf as "am" | "pm")
            : undefined,
        endHalf:
          selected?.allowHalfDay && !singleDay && endHalf !== "full"
            ? (endHalf as "am" | "pm")
            : undefined,
        reason: reason.trim() || undefined,
        attachmentStorageId: attachment?.id,
      })
      toast.success("Leave request submitted")
      setOpen(false)
      reset()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <IconPlus className="size-4" />
          Apply for leave
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apply for leave</DialogTitle>
          <DialogDescription>
            Weekends and public holidays are excluded automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Leave type</Label>
            <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select leave type" />
              </SelectTrigger>
              <SelectContent>
                {leaveTypes?.map((t) => (
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
                onChange={(e) => {
                  setStartDate(e.target.value)
                  if (endDate < e.target.value) setEndDate(e.target.value)
                }}
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

          {selected?.allowHalfDay && (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>{singleDay ? "Duration" : "First day"}</Label>
                <Select value={startHalf} onValueChange={setStartHalf}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HALF.map((h) => (
                      <SelectItem key={h.value} value={h.value}>
                        {h.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!singleDay && (
                <div className="grid gap-2">
                  <Label>Last day</Label>
                  <Select value={endHalf} onValueChange={setEndHalf}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HALF.map((h) => (
                        <SelectItem key={h.value} value={h.value}>
                          {h.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          <div className="grid gap-2">
            <Label>Reason</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Optional"
              rows={2}
            />
          </div>

          <div className="flex items-center gap-2">
            <FileUpload
              label={
                selected?.requiresAttachment
                  ? "Attach document (required)"
                  : "Attach document"
              }
              generateUrl={generateUrl}
              onUploaded={(id, file) => setAttachment({ id, name: file.name })}
            />
            {attachment && (
              <span className="text-muted-foreground flex items-center gap-1 text-xs">
                <IconPaperclip className="size-3" />
                {attachment.name}
                <IconCheck className="size-3 text-green-600" />
              </span>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
