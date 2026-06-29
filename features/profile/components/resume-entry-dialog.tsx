"use client"

import * as React from "react"
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

export type ResumeEntry = {
  id: string
  title: string
  organization?: string
  location?: string
  startDate?: string
  endDate?: string
  description?: string
}

const t = (s?: string) => {
  const v = s?.trim()
  return v ? v : undefined
}

export function ResumeEntryDialog({
  open,
  onOpenChange,
  kindLabel,
  titleLabel,
  orgLabel,
  initial,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** e.g. "experience" / "qualification" — used in the dialog title. */
  kindLabel: string
  titleLabel: string
  orgLabel: string
  initial: ResumeEntry | null
  onSave: (entry: ResumeEntry) => Promise<void> | void
}) {
  const [form, setForm] = React.useState<ResumeEntry>(
    initial ?? { id: "", title: "" },
  )
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) setForm(initial ?? { id: "", title: "" })
  }, [open, initial])

  function set<K extends keyof ResumeEntry>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function submit() {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      await onSave({
        id: form.id || crypto.randomUUID(),
        title: form.title.trim(),
        organization: t(form.organization),
        location: t(form.location),
        startDate: t(form.startDate),
        endDate: t(form.endDate),
        description: t(form.description),
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {initial ? "Edit" : "Add"} {kindLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Row label={titleLabel} required>
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} />
          </Row>
          <Row label={orgLabel}>
            <Input
              value={form.organization ?? ""}
              onChange={(e) => set("organization", e.target.value)}
            />
          </Row>
          <Row label="Location">
            <Input
              value={form.location ?? ""}
              onChange={(e) => set("location", e.target.value)}
            />
          </Row>
          <div className="grid grid-cols-2 gap-4">
            <Row label="Start">
              <Input
                type="month"
                value={form.startDate ?? ""}
                onChange={(e) => set("startDate", e.target.value)}
              />
            </Row>
            <Row label="End (blank = present)">
              <Input
                type="month"
                value={form.endDate ?? ""}
                onChange={(e) => set("endDate", e.target.value)}
              />
            </Row>
          </div>
          <Row label="Description">
            <Textarea
              rows={4}
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
            />
          </Row>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !form.title.trim()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Row({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  )
}
