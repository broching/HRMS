"use client"

import * as React from "react"
import { useMutation } from "convex/react"
import { IconPencil, IconPlus, IconLock, IconX } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Gender } from "@/convex/lib/enums"
import type { MaritalStatus, PersonalFieldType } from "@/convex/lib/enums"
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  GENDER_LABELS,
  MARITAL_STATUS_LABELS,
} from "@/features/employees/lib/labels"
import { Field, type ProfileData } from "./profile-fields"
import { CustomFieldDialog } from "./custom-field-dialog"

type PersonalField = { id: string; label: string; type: PersonalFieldType; value: string }

const t = (s?: string) => {
  const v = s?.trim()
  return v ? v : undefined
}

const inputType = (type: PersonalFieldType) =>
  type === "number" ? "number" : type === "date" ? "date" : "text"

export function PersonalDetailsSection({
  employee,
}: {
  employee: ProfileData
}) {
  const update = useMutation(api.employees.updateOwnProfile)
  const [editing, setEditing] = React.useState(false)
  const [addingField, setAddingField] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const initial = React.useMemo(
    () => ({
      dob: employee.dob ?? "",
      nationality: employee.nationality ?? "",
      gender: employee.gender ?? "",
      maritalStatus: employee.maritalStatus ?? "",
      phone: employee.contact?.phone ?? "",
      personalEmail: employee.contact?.personalEmail ?? "",
      line1: employee.address?.line1 ?? "",
      line2: employee.address?.line2 ?? "",
      city: employee.address?.city ?? "",
      state: employee.address?.state ?? "",
      postalCode: employee.address?.postalCode ?? "",
      country: employee.address?.country ?? "",
      personalFields: (employee.personalFields ?? []) as PersonalField[],
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

  async function persist(fields: PersonalField[]) {
    await update({
      dob: t(form.dob),
      nationality: t(form.nationality),
      gender: (form.gender || undefined) as Gender | undefined,
      maritalStatus: (form.maritalStatus || undefined) as
        | MaritalStatus
        | undefined,
      contact: {
        personalEmail: t(form.personalEmail),
        phone: t(form.phone),
      },
      address: {
        line1: t(form.line1),
        line2: t(form.line2),
        city: t(form.city),
        state: t(form.state),
        postalCode: t(form.postalCode),
        country: t(form.country),
      },
      personalFields: fields,
    })
  }

  async function save() {
    setSaving(true)
    try {
      await persist(form.personalFields)
      toast.success("Personal details updated")
      setEditing(false)
    } catch {
      toast.error("Could not save")
    } finally {
      setSaving(false)
    }
  }

  // Adding a custom field saves immediately so it appears even outside edit mode.
  async function addCustomField(label: string, type: PersonalFieldType) {
    const next: PersonalField[] = [
      ...(employee.personalFields ?? []),
      { id: crypto.randomUUID(), label, type, value: "" },
    ]
    try {
      await update({ personalFields: next })
      toast.success("Field added")
      setForm((f) => ({ ...f, personalFields: next }))
    } catch {
      toast.error("Could not add field")
    }
  }

  async function removeCustomField(id: string) {
    const next = (employee.personalFields ?? []).filter((p) => p.id !== id)
    try {
      await update({ personalFields: next })
      setForm((f) => ({ ...f, personalFields: next }))
    } catch {
      toast.error("Could not remove field")
    }
  }

  const addressLine = [
    employee.address?.line1,
    employee.address?.line2,
    employee.address?.city,
    employee.address?.state,
    employee.address?.postalCode,
    employee.address?.country,
  ]
    .filter(Boolean)
    .join(", ")

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Personal details</h2>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-muted-foreground">
                  <IconLock className="size-4" />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Only visible to you and HR.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        {employee.isSelf && (
          <div className="flex items-center gap-1">
            {!editing && (
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={start}
              >
                <IconPencil className="size-4" />
                <span className="sr-only">Edit personal details</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setAddingField(true)}
            >
              <IconPlus className="size-4" />
              <span className="sr-only">Add custom field</span>
            </Button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <EditText label="Date of birth" type="date" value={form.dob} onChange={(v) => set("dob", v)} />
            <EditText label="Nationality" value={form.nationality} onChange={(v) => set("nationality", v)} />
            <EditSelect
              label="Gender"
              value={form.gender}
              onChange={(v) => set("gender", v)}
              options={GENDER_LABELS}
            />
            <EditSelect
              label="Marital status"
              value={form.maritalStatus}
              onChange={(v) => set("maritalStatus", v)}
              options={MARITAL_STATUS_LABELS}
            />
            <EditText label="Mobile phone" value={form.phone} onChange={(v) => set("phone", v)} />
            <EditText label="Personal email" value={form.personalEmail} onChange={(v) => set("personalEmail", v)} />
            <div className="flex flex-col gap-1.5">
              <Label className="text-muted-foreground text-xs uppercase">Work email</Label>
              <Input value={employee.contact?.workEmail ?? ""} disabled />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium">Address</Label>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <EditText label="Address line 1" value={form.line1} onChange={(v) => set("line1", v)} />
              <EditText label="Address line 2" value={form.line2} onChange={(v) => set("line2", v)} />
              <EditText label="City" value={form.city} onChange={(v) => set("city", v)} />
              <EditText label="State" value={form.state} onChange={(v) => set("state", v)} />
              <EditText label="Postal code" value={form.postalCode} onChange={(v) => set("postalCode", v)} />
              <EditText label="Country" value={form.country} onChange={(v) => set("country", v)} />
            </div>
          </div>

          {form.personalFields.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {form.personalFields.map((pf) => (
                <div key={pf.id} className="flex flex-col gap-1.5">
                  <Label className="text-muted-foreground flex items-center justify-between text-xs uppercase">
                    {pf.label}
                    <button
                      type="button"
                      onClick={() => removeCustomField(pf.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <IconX className="size-3.5" />
                    </button>
                  </Label>
                  <Input
                    type={inputType(pf.type)}
                    value={pf.value}
                    onChange={(e) =>
                      set(
                        "personalFields",
                        form.personalFields.map((x) =>
                          x.id === pf.id ? { ...x, value: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Date of birth" value={employee.dob} />
          <Field label="Nationality" value={employee.nationality} />
          <Field
            label="Gender"
            value={employee.gender ? GENDER_LABELS[employee.gender] : undefined}
          />
          <Field
            label="Marital status"
            value={
              employee.maritalStatus
                ? MARITAL_STATUS_LABELS[employee.maritalStatus]
                : undefined
            }
          />
          <Field label="Mobile phone" value={employee.contact?.phone} />
          <Field label="Personal email" value={employee.contact?.personalEmail} />
          <Field label="Work email" value={employee.contact?.workEmail} />
          <Field label="Address" value={addressLine} />
          {(employee.personalFields ?? []).map((pf) => (
            <Field key={pf.id} label={pf.label} value={pf.value} />
          ))}
        </div>
      )}

      <CustomFieldDialog
        open={addingField}
        onOpenChange={setAddingField}
        onAdd={addCustomField}
      />
    </section>
  )
}

function EditText({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-muted-foreground text-xs uppercase">{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function EditSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Record<string, string>
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-muted-foreground text-xs uppercase">{label}</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(options).map(([k, l]) => (
            <SelectItem key={k} value={k}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
