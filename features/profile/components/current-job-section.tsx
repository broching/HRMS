"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { IconPencil, IconLock } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id, TableNames } from "@/convex/_generated/dataModel"
import type { EmploymentType, EmployeeStatus } from "@/convex/lib/enums"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  EMPLOYEE_STATUSES,
  STATUS_LABELS,
} from "@/features/employees/lib/labels"
import { Field, type ProfileData } from "./profile-fields"

const NONE = "none"
const optId = <T extends TableNames>(s: string) =>
  s && s !== NONE ? (s as Id<T>) : undefined
const optDate = (s: string) => (s.trim() ? s.trim() : undefined)

export function CurrentJobSection({ employee }: { employee: ProfileData }) {
  const update = useMutation(api.employees.update)
  const departments = useQuery(api.departments.list) ?? []
  const teams = useQuery(api.teams.list) ?? []
  const positions = useQuery(api.positions.list) ?? []
  const offices = useQuery(api.offices.list) ?? []
  const allEmployees = useQuery(api.employees.list, {}) ?? []

  const [editing, setEditing] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const initial = React.useMemo(
    () => ({
      departmentId: employee.departmentId ?? NONE,
      teamId: employee.teamId ?? NONE,
      positionId: employee.positionId ?? NONE,
      managerId: employee.managerId ?? NONE,
      officeId: employee.officeId ?? NONE,
      employmentType: employee.employmentType,
      status: employee.status,
      joinDate: employee.joinDate ?? "",
      confirmationDate: employee.confirmationDate ?? "",
      probationEndDate: employee.probationEndDate ?? "",
      exitDate: employee.exitDate ?? "",
    }),
    [employee],
  )
  const [form, setForm] = React.useState(initial)

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function start() {
    setForm(initial)
    setEditing(true)
  }

  async function save() {
    setSaving(true)
    try {
      await update({
        employeeId: employee._id,
        // firstName/lastName are required by update; pass them unchanged.
        firstName: employee.firstName,
        lastName: employee.lastName,
        departmentId: optId<"departments">(form.departmentId),
        teamId: optId<"teams">(form.teamId),
        positionId: optId<"positions">(form.positionId),
        managerId: optId<"employees">(form.managerId),
        officeId: optId<"offices">(form.officeId),
        employmentType: form.employmentType,
        status: form.status,
        joinDate: optDate(form.joinDate),
        confirmationDate: optDate(form.confirmationDate),
        probationEndDate: optDate(form.probationEndDate),
      })
      toast.success("Job updated")
      setEditing(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save")
    } finally {
      setSaving(false)
    }
  }

  const managerOptions = allEmployees
    .filter((e) => e._id !== employee._id)
    .map((e) => ({
      value: e._id,
      label: e.isVacant
        ? `${e.positionTitle ?? "Vacant"} (vacant)`
        : `${e.preferredName ?? e.firstName} ${e.lastName}`,
    }))

  if (editing) {
    return (
      <section className="flex flex-col gap-6">
        <h2 className="text-lg font-semibold">Current job</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            label="Position"
            value={form.positionId}
            onChange={(v) => set("positionId", v)}
            options={positions.map((p) => ({ value: p._id, label: p.title }))}
          />
          <Picker
            label="Manager"
            value={form.managerId}
            onChange={(v) => set("managerId", v)}
            options={managerOptions}
          />
          <Picker
            label="Office"
            value={form.officeId}
            onChange={(v) => set("officeId", v)}
            options={offices.map((o) => ({ value: o._id, label: o.name }))}
          />
          <Plain label="Employment type">
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
          </Plain>
          <Plain label="Status">
            <Select
              value={form.status}
              onValueChange={(v) => set("status", v as EmployeeStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMPLOYEE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Plain>
          <DateField label="Join date" value={form.joinDate} onChange={(v) => set("joinDate", v)} />
          <DateField label="Confirmation date" value={form.confirmationDate} onChange={(v) => set("confirmationDate", v)} />
          <DateField label="Probation end" value={form.probationEndDate} onChange={(v) => set("probationEndDate", v)} />
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </Button>
        </div>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Current job</h2>
        {employee.canManage ? (
          <Button variant="ghost" size="icon" className="size-8" onClick={start}>
            <IconPencil className="size-4" />
            <span className="sr-only">Edit job</span>
          </Button>
        ) : (
          employee.isSelf && (
            <span className="text-muted-foreground flex items-center gap-1 text-xs">
              <IconLock className="size-3" /> Managed by HR
            </span>
          )
        )}
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Department" value={employee.departmentName} />
        <Field label="Team" value={employee.teamName} />
        <Field label="Position" value={employee.positionTitle} />
        <Field label="Manager" value={employee.managerName} />
        <Field label="Office" value={employee.officeName} />
        <Field
          label="Employment type"
          value={EMPLOYMENT_TYPE_LABELS[employee.employmentType]}
        />
        <Field label="Join date" value={employee.joinDate} />
        <Field label="Confirmation date" value={employee.confirmationDate} />
        <Field label="Probation end" value={employee.probationEndDate} />
        <Field label="Exit date" value={employee.exitDate} />
      </div>
    </section>
  )
}

function Plain({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-muted-foreground text-xs uppercase">{label}</Label>
      {children}
    </div>
  )
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <Plain label={label}>
      <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} />
    </Plain>
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
    <Plain label={label}>
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
    </Plain>
  )
}
