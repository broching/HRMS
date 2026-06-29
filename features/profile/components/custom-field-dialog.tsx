"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import type { PersonalFieldType } from "@/convex/lib/enums"

export function CustomFieldDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (label: string, type: PersonalFieldType) => Promise<void> | void
}) {
  const [label, setLabel] = React.useState("")
  const [type, setType] = React.useState<PersonalFieldType>("text")
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setLabel("")
      setType("text")
    }
  }, [open])

  async function submit() {
    const trimmed = label.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      await onAdd(trimmed, type)
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add custom field</DialogTitle>
          <DialogDescription>
            Add your own field to your personal details.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="cf-label">Field label</Label>
            <Input
              id="cf-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Blood type"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Field type</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as PersonalFieldType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="date">Date</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || !label.trim()}>
            Add field
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
