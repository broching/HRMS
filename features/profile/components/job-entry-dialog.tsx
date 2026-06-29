"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id, TableNames } from "@/convex/_generated/dataModel"
import type { FunctionReturnType } from "convex/server"
import type { EmploymentType } from "@/convex/lib/enums"
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
import {
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
} from "@/features/employees/lib/labels"

type JobRow = FunctionReturnType<typeof api.jobHistory.listForEmployee>[number]

const NONE = "none"
const optId = <T extends TableNames>(s: string) =>
  s && s !== NONE ? (s as Id<T>) : undefined

export function JobEntryDialog({
  open,
  onOpenChange,
  employeeId,
  initial,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  employeeId: Id<"employees">
  initial: JobRow | null
}) {
  const add = useMutation(api.jobHistory.add)
  const update = useMutation(api.jobHistory.update)
  const departments = useQuery(api.departments.list) ?? []
  const positions = useQuery(api.positions.list) ?? []
  const offices = useQuery(api.offices.list) ?? []
  const allEmployees = useQuery(api.employees.list, {}) ?? []

  const [form, setForm] = React.useState({
    effectiveDate: "",
    positionId: NONE,
    title: "",
    departmentId: NONE,
    officeId: NONE,
    managerId: NONE,
    employmentType: "full_time" as EmploymentType,
    note: "",
  })
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setForm({
      effectiveDate: initial?.effectiveDate ?? new Date().toISOString().slice(0, 10),
      positionId: initial?.positionId ?? NONE,
      title: initial?.rawTitle ?? "",
      departmentId: initial?.departmentId ?? NONE,
      officeId: initial?.officeId ?? NONE,
      managerId: initial?.managerId ?? NONE,
      employmentType: initial?.employmentType ?? "full_time",
      note: initial?.note ?? "",
    })
  }, [open, initial])

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function submit() {
    if (!form.effectiveDate) {
      toast.error("Effective date is required.")
      return
    }
    const payload = {
      effectiveDate: form.effectiveDate,
      positionId: optId<"positions">(form.positionId),
      title: form.title.trim() || undefined,
      departmentId: optId<"departments">(form.departmentId),
      officeId: optId<"offices">(form.officeId),
      managerId: optId<"employees">(form.managerId),
      employmentType: form.employmentType,
      note: form.note.trim() || undefined,
    }
    setSaving(true)
    try {
      if (initial) {
        await update({ jobHistoryId: initial._id, ...payload })
      } else {
        await add({ employeeId, ...payload })
      }
      toast.success("Job record saved")
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save")
    } finally {
      setSaving(false)
    }
  }

  const managerOptions = allEmployees
    .filter((e) => e._id !== employeeId)
    .map((e) => ({
      value: e._id,
      label: `${e.preferredName ?? e.firstName} ${e.lastName}`,
    }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit job record" : "Add job record"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <Row label="Effective date">
            <Input
              type="date"
              value={form.effectiveDate}
              onChange={(e) => set("effectiveDate", e.target.value)}
            />
          </Row>
          <PickRow
            label="Position"
            value={form.positionId}
            onChange={(v) => set("positionId", v)}
            options={positions.map((p) => ({ value: p._id, label: p.title }))}
          />
          <Row label="Title (if no position)">
            <Input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Head of Sales"
            />
          </Row>
          <Row label="Employment type">
            <Select
              value={form.employmentType}
              onValueChange={(v) => set("employmentType", v as EmploymentType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_TYPES.map((tname) => (
                  <SelectItem key={tname} value={tname}>
                    {EMPLOYMENT_TYPE_LABELS[tname]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <PickRow
            label="Department"
            value={form.departmentId}
            onChange={(v) => set("departmentId", v)}
            options={departments.map((d) => ({ value: d._id, label: d.name }))}
          />
          <PickRow
            label="Office"
            value={form.officeId}
            onChange={(v) => set("officeId", v)}
            options={offices.map((o) => ({ value: o._id, label: o.name }))}
          />
          <PickRow
            label="Manager"
            value={form.managerId}
            onChange={(v) => set("managerId", v)}
            options={managerOptions}
          />
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

function PickRow({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <Row label={label}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>None</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Row>
  )
}
