"use client"

import * as React from "react"
import { useMutation } from "convex/react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { FunctionReturnType } from "convex/server"
import type { EquipmentStatus } from "@/convex/lib/enums"
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

type EquipmentItem = FunctionReturnType<
  typeof api.equipment.listForEmployee
>[number]

const empty = {
  name: "",
  category: "",
  serialNumber: "",
  assignedDate: "",
  returnedDate: "",
  status: "assigned" as EquipmentStatus,
  note: "",
}

const t = (s: string) => (s.trim() ? s.trim() : undefined)

export function EquipmentDialog({
  open,
  onOpenChange,
  employeeId,
  initial,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  employeeId: Id<"employees">
  initial: EquipmentItem | null
}) {
  const add = useMutation(api.equipment.add)
  const update = useMutation(api.equipment.update)
  const [form, setForm] = React.useState(empty)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setForm(
      initial
        ? {
            name: initial.name,
            category: initial.category ?? "",
            serialNumber: initial.serialNumber ?? "",
            assignedDate: initial.assignedDate ?? "",
            returnedDate: initial.returnedDate ?? "",
            status: initial.status,
            note: initial.note ?? "",
          }
        : empty,
    )
  }, [open, initial])

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function submit() {
    if (!form.name.trim()) {
      toast.error("Name is required.")
      return
    }
    const payload = {
      name: form.name.trim(),
      category: t(form.category),
      serialNumber: t(form.serialNumber),
      assignedDate: t(form.assignedDate),
      returnedDate: t(form.returnedDate),
      status: form.status,
      note: t(form.note),
    }
    setSaving(true)
    try {
      if (initial) await update({ equipmentId: initial._id, ...payload })
      else await add({ employeeId, ...payload })
      toast.success("Equipment saved")
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit equipment" : "Add equipment"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <Row label="Name">
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
          </Row>
          <Row label="Category">
            <Input
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              placeholder="Laptop, phone, …"
            />
          </Row>
          <Row label="Serial number">
            <Input
              value={form.serialNumber}
              onChange={(e) => set("serialNumber", e.target.value)}
            />
          </Row>
          <Row label="Status">
            <Select
              value={form.status}
              onValueChange={(v) => set("status", v as EquipmentStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="returned">Returned</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row label="Assigned date">
            <Input
              type="date"
              value={form.assignedDate}
              onChange={(e) => set("assignedDate", e.target.value)}
            />
          </Row>
          <Row label="Returned date">
            <Input
              type="date"
              value={form.returnedDate}
              onChange={(e) => set("returnedDate", e.target.value)}
            />
          </Row>
          <div className="sm:col-span-2">
            <Row label="Note">
              <Textarea
                rows={2}
                value={form.note}
                onChange={(e) => set("note", e.target.value)}
              />
            </Row>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  )
}
