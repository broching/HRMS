"use client"

import { getErrorMessage } from "@/lib/errors"
import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { InterviewMode } from "@/convex/lib/enums"
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

const NONE = "none"

export function ScheduleInterviewDialog({
  candidateId,
  candidateName,
  open,
  onOpenChange,
}: {
  candidateId: Id<"candidates">
  candidateName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const schedule = useMutation(api.recruitment.scheduleInterview)
  const members = useQuery(api.members.list) ?? []

  const [when, setWhen] = React.useState("")
  const [duration, setDuration] = React.useState("60")
  const [mode, setMode] = React.useState<InterviewMode>("video")
  const [locationOrLink, setLocationOrLink] = React.useState("")
  const [interviewer, setInterviewer] = React.useState<string>(NONE)
  const [notes, setNotes] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function submit() {
    setBusy(true)
    try {
      const ms = when ? new Date(when).getTime() : NaN
      if (!Number.isFinite(ms)) throw new Error("Pick a date and time.")
      await schedule({
        candidateId,
        scheduledAt: ms,
        durationMins: Number(duration) || 60,
        mode,
        locationOrLink: locationOrLink.trim() || undefined,
        interviewerUserId:
          interviewer === NONE ? undefined : (interviewer as Id<"users">),
        notes: notes.trim() || undefined,
      })
      toast.success("Interview scheduled")
      setWhen("")
      setLocationOrLink("")
      setNotes("")
      onOpenChange(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't schedule"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule interview</DialogTitle>
          <DialogDescription>{candidateName}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="iv-when">Date &amp; time</Label>
              <Input
                id="iv-when"
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="iv-dur">Duration (mins)</Label>
              <Input
                id="iv-dur"
                type="number"
                min="15"
                step="15"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as InterviewMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="video">Video call</SelectItem>
                  <SelectItem value="onsite">On-site</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Interviewer</Label>
              <Select value={interviewer} onValueChange={setInterviewer}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="iv-loc">Location / link</Label>
            <Input
              id="iv-loc"
              value={locationOrLink}
              onChange={(e) => setLocationOrLink(e.target.value)}
              placeholder="Meeting room 2 / https://meet…"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="iv-notes">Notes</Label>
            <Textarea
              id="iv-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
