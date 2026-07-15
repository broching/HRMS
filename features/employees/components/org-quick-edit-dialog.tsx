"use client"

import * as React from "react"
import Link from "next/link"
import { useMutation } from "convex/react"
import { ConvexError } from "convex/values"
import { toast } from "sonner"
import { IconExternalLink } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
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

const NONE = "__none__"

type Option = { id: string; label: string }

type Props = {
  employeeId: Id<"employees">
  employeeName: string
  initial: {
    departmentId: Id<"departments"> | null
    positionId: Id<"positions"> | null
    officeId: Id<"offices"> | null
    managerId: Id<"employees"> | null
    additionalManagerIds: Id<"employees">[]
  }
  departments: Option[]
  positions: Option[]
  offices: Option[]
  /** Valid managers (self + descendants already excluded to avoid cycles). */
  managerOptions: Option[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function OrgQuickEditDialog({
  employeeId,
  employeeName,
  initial,
  departments,
  positions,
  offices,
  managerOptions,
  open,
  onOpenChange,
}: Props) {
  const quickUpdate = useMutation(api.employees.quickUpdateJob)
  const setManager = useMutation(api.employees.setManager)
  const setAdditionalManagers = useMutation(api.employees.setAdditionalManagers)

  const [dept, setDept] = React.useState<string>(initial.departmentId ?? NONE)
  const [pos, setPos] = React.useState<string>(initial.positionId ?? NONE)
  const [office, setOffice] = React.useState<string>(initial.officeId ?? NONE)
  const [manager, setManagerId] = React.useState<string>(
    initial.managerId ?? NONE,
  )
  const [additional, setAdditional] = React.useState<Set<string>>(
    () => new Set(initial.additionalManagerIds),
  )
  const [saving, setSaving] = React.useState(false)

  // Re-seed the form whenever a different card opens the dialog.
  React.useEffect(() => {
    if (!open) return
    setDept(initial.departmentId ?? NONE)
    setPos(initial.positionId ?? NONE)
    setOffice(initial.officeId ?? NONE)
    setManagerId(initial.managerId ?? NONE)
    setAdditional(new Set(initial.additionalManagerIds))
  }, [open, initial])

  async function handleSave() {
    setSaving(true)
    try {
      // Manager first — its cycle guard can reject, and we don't want to half-
      // apply the job fields if the reporting change is invalid.
      const nextManager = manager === NONE ? null : (manager as Id<"employees">)
      if (nextManager !== (initial.managerId ?? null)) {
        await setManager({ employeeId, managerId: nextManager })
      }
      // Additional managers: exclude the primary (it's covered by managerId).
      const nextAdditional = [...additional].filter((id) => id !== manager)
      const before = [...initial.additionalManagerIds].sort().join(",")
      const after = [...nextAdditional].sort().join(",")
      if (before !== after) {
        await setAdditionalManagers({
          employeeId,
          managerIds: nextAdditional as Id<"employees">[],
        })
      }
      await quickUpdate({
        employeeId,
        departmentId: dept === NONE ? null : (dept as Id<"departments">),
        positionId: pos === NONE ? null : (pos as Id<"positions">),
        officeId: office === NONE ? null : (office as Id<"offices">),
      })
      toast.success("Updated")
      onOpenChange(false)
    } catch (err) {
      const message =
        err instanceof ConvexError
          ? (err.data as { message?: string })?.message
          : undefined
      toast.error(message ?? "Couldn't save changes.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{employeeName}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          <Field label="Position">
            <PickSelect
              value={pos}
              onChange={setPos}
              placeholder="No position"
              options={positions}
            />
          </Field>
          <Field label="Department">
            <PickSelect
              value={dept}
              onChange={setDept}
              placeholder="No department"
              options={departments}
            />
          </Field>
          <Field label="Office">
            <PickSelect
              value={office}
              onChange={setOffice}
              placeholder="No office"
              options={offices}
            />
          </Field>
          <Field label="Reports to">
            <PickSelect
              value={manager}
              onChange={setManagerId}
              placeholder="No manager"
              options={managerOptions}
            />
          </Field>
          <Field label="Also reports to (dotted line)">
            <AdditionalManagers
              options={managerOptions.filter((o) => o.id !== manager)}
              selected={additional}
              onToggle={(id, checked) =>
                setAdditional((cur) => {
                  const next = new Set(cur)
                  if (checked) next.add(id)
                  else next.delete(id)
                  return next
                })
              }
            />
          </Field>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button asChild variant="ghost" size="sm" className="sm:mr-auto">
            <Link href={`/employees/${employeeId}`}>
              <IconExternalLink className="size-4" />
              View full profile
            </Link>
          </Button>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      {children}
    </div>
  )
}

// Scrollable checkbox list of secondary (dotted-line) managers. Empty when
// there are no eligible people (e.g. everyone is in this person's own subtree).
function AdditionalManagers({
  options,
  selected,
  onToggle,
}: {
  options: Option[]
  selected: Set<string>
  onToggle: (id: string, checked: boolean) => void
}) {
  if (options.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">No other people available.</p>
    )
  }
  return (
    <div className="max-h-40 overflow-y-auto rounded-md border p-1">
      {options.map((o) => (
        <label
          key={o.id}
          className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
        >
          <Checkbox
            checked={selected.has(o.id)}
            onCheckedChange={(c) => onToggle(o.id, c === true)}
          />
          <span className="truncate">{o.label}</span>
        </label>
      ))}
    </div>
  )
}

function PickSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  options: Option[]
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
