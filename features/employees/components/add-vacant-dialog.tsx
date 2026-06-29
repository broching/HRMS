"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id, TableNames } from "@/convex/_generated/dataModel"
import type { EmploymentType } from "@/convex/lib/enums"
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
import {
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
} from "@/features/employees/lib/labels"

const NONE = "none"
const optId = <T extends TableNames>(s: string) =>
  s && s !== NONE ? (s as Id<T>) : undefined

export function AddVacantDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const createVacant = useMutation(api.employees.createVacant)
  const departments = useQuery(api.departments.list) ?? []
  const teams = useQuery(api.teams.list) ?? []
  const positions = useQuery(api.positions.list) ?? []
  const offices = useQuery(api.offices.list) ?? []
  const allEmployees = useQuery(api.employees.list, {}) ?? []

  const empty = {
    title: "",
    positionId: NONE,
    departmentId: NONE,
    teamId: NONE,
    officeId: NONE,
    managerId: NONE,
    employmentType: "full_time" as EmploymentType,
  }
  const [form, setForm] = React.useState(empty)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) setForm(empty)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function submit() {
    if (!form.title.trim() && form.positionId === NONE) {
      toast.error("Give the vacancy a title or pick a position.")
      return
    }
    setSaving(true)
    try {
      await createVacant({
        title: form.title.trim() || undefined,
        positionId: optId<"positions">(form.positionId),
        departmentId: optId<"departments">(form.departmentId),
        teamId: optId<"teams">(form.teamId),
        officeId: optId<"offices">(form.officeId),
        managerId: optId<"employees">(form.managerId),
        employmentType: form.employmentType,
      })
      toast.success("Vacant position added")
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add position")
    } finally {
      setSaving(false)
    }
  }

  const managerOptions = allEmployees.map((e) => ({
    value: e._id,
    label: e.isVacant
      ? `${e.positionTitle ?? "Vacant"} (vacant)`
      : `${e.preferredName ?? e.firstName} ${e.lastName}`,
  }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add to org chart</DialogTitle>
          <DialogDescription>
            Add a vacant position (no person yet), or{" "}
            <Link
              href="/employees/new"
              className="text-primary underline"
              onClick={() => onOpenChange(false)}
            >
              hire a real employee
            </Link>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <Row label="Title">
            <Input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Marketing Manager"
            />
          </Row>
          <Picker
            label="Position"
            value={form.positionId}
            onChange={(v) => set("positionId", v)}
            options={positions.map((p) => ({ value: p._id, label: p.title }))}
          />
          <Picker
            label="Reports to (manager)"
            value={form.managerId}
            onChange={(v) => set("managerId", v)}
            options={managerOptions}
          />
          <Row label="Employment type">
            <Select
              value={form.employmentType}
              onValueChange={(v) => set("employmentType", v as EmploymentType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {EMPLOYMENT_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <Picker
            label="Department"
            value={form.departmentId}
            onChange={(v) => set("departmentId", v)}
            options={departments.map((d) => ({ value: d._id, label: d.name }))}
          />
          <Picker
            label="Team"
            value={form.teamId}
            onChange={(v) => set("teamId", v)}
            options={teams.map((t) => ({ value: t._id, label: t.name }))}
          />
          <Picker
            label="Office"
            value={form.officeId}
            onChange={(v) => set("officeId", v)}
            options={offices.map((o) => ({ value: o._id, label: o.name }))}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Adding…" : "Add position"}
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

function Picker({
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
