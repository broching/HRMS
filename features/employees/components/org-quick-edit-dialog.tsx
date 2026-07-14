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

  const [dept, setDept] = React.useState<string>(initial.departmentId ?? NONE)
  const [pos, setPos] = React.useState<string>(initial.positionId ?? NONE)
  const [office, setOffice] = React.useState<string>(initial.officeId ?? NONE)
  const [manager, setManagerId] = React.useState<string>(
    initial.managerId ?? NONE,
  )
  const [saving, setSaving] = React.useState(false)

  // Re-seed the form whenever a different card opens the dialog.
  React.useEffect(() => {
    if (!open) return
    setDept(initial.departmentId ?? NONE)
    setPos(initial.positionId ?? NONE)
    setOffice(initial.officeId ?? NONE)
    setManagerId(initial.managerId ?? NONE)
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
