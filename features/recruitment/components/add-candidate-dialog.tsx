"use client"

import * as React from "react"
import { useMutation } from "convex/react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { CandidateStage } from "@/convex/lib/enums"
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
import { STAGE_LABELS, STAGE_ORDER } from "@/features/recruitment/lib/labels"

export function AddCandidateDialog({
  jobId,
  jobTitle,
  open,
  onOpenChange,
}: {
  jobId: Id<"jobs">
  jobTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const addCandidate = useMutation(api.recruitment.addCandidate)
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [phone, setPhone] = React.useState("")
  const [stage, setStage] = React.useState<CandidateStage>("screening")
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function submit() {
    setBusy(true)
    try {
      if (!name.trim()) throw new Error("Enter the candidate's name.")
      await addCandidate({
        jobId,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        stage,
        coverLetter: note.trim() || undefined,
        source: "manual",
      })
      toast.success("Candidate added")
      setName("")
      setEmail("")
      setPhone("")
      setNote("")
      setStage("screening")
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add candidate")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add candidate</DialogTitle>
          <DialogDescription>{jobTitle}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cand-name">Name</Label>
            <Input
              id="cand-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cand-email">Email</Label>
              <Input
                id="cand-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cand-phone">Phone</Label>
              <Input
                id="cand-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Stage</Label>
            <Select value={stage} onValueChange={(v) => setStage(v as CandidateStage)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGE_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cand-note">Notes</Label>
            <Textarea
              id="cand-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            Add candidate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
