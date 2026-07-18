"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { IconPlus, IconTrash, IconGripVertical } from "@tabler/icons-react"
import { toast } from "sonner"
import { getErrorMessage } from "@/lib/errors"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export type FieldDef = FunctionReturnType<typeof api.taskFields.list>[number]
export type CustomFieldValues = Record<string, unknown>

const FIELD_NONE = "__none__"

/** Editable inputs for the org's active custom fields on a task. */
export function CustomFieldsEditor({
  defs,
  values,
  onChange,
}: {
  defs: FieldDef[]
  values: CustomFieldValues
  onChange: (next: CustomFieldValues) => void
}) {
  const active = defs.filter((d) => d.active)
  if (active.length === 0) return null

  function set(key: string, value: unknown) {
    const next = { ...values }
    if (value === undefined || value === "" || value === null) delete next[key]
    else next[key] = value
    onChange(next)
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {active.map((def) => {
        const val = values[def.key]
        return (
          <div key={def._id} className="flex min-w-0 flex-col gap-1.5">
            <Label className="text-xs">{def.label}</Label>
            {def.type === "text" && (
              <Input
                value={(val as string) ?? ""}
                onChange={(e) => set(def.key, e.target.value)}
              />
            )}
            {def.type === "number" && (
              <Input
                type="number"
                value={val === undefined ? "" : String(val)}
                onChange={(e) =>
                  set(def.key, e.target.value === "" ? undefined : Number(e.target.value))
                }
              />
            )}
            {def.type === "date" && (
              <Input
                type="date"
                value={(val as string) ?? ""}
                onChange={(e) => set(def.key, e.target.value)}
              />
            )}
            {def.type === "select" && (
              <Select
                value={(val as string) ?? FIELD_NONE}
                onValueChange={(v) => set(def.key, v === FIELD_NONE ? undefined : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FIELD_NONE}>—</SelectItem>
                  {(def.options ?? []).map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {def.type === "checkbox" && (
              <div className="flex h-9 items-center">
                <Checkbox
                  checked={val === true}
                  onCheckedChange={(v) => set(def.key, v === true ? true : undefined)}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/** Read-only rendering of a task's custom field values. */
export function CustomFieldsView({
  defs,
  values,
}: {
  defs: FieldDef[]
  values: CustomFieldValues
}) {
  const rows = defs
    .filter((d) => d.active)
    .map((d) => ({ def: d, val: values[d.key] }))
    .filter((r) => r.val !== undefined && r.val !== null && r.val !== "")
  if (rows.length === 0) return null
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
      {rows.map(({ def, val }) => (
        <div key={def._id} className="flex flex-col">
          <dt className="text-muted-foreground text-[11px] tracking-wide uppercase">
            {def.label}
          </dt>
          <dd className="truncate">
            {def.type === "checkbox" ? (val === true ? "Yes" : "No") : String(val)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

const TYPE_LABELS: Record<FieldDef["type"], string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  select: "Dropdown",
  checkbox: "Checkbox",
}

/** CRUD dialog for the org's custom task field schema. Managers only. */
export function TaskFieldManager({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const defs = useQuery(api.taskFields.list, open ? {} : "skip")
  const save = useMutation(api.taskFields.save)
  const remove = useMutation(api.taskFields.remove)

  const [label, setLabel] = React.useState("")
  const [type, setType] = React.useState<FieldDef["type"]>("text")
  const [optionsText, setOptionsText] = React.useState("")

  async function add() {
    const l = label.trim()
    if (!l) return
    try {
      await save({
        label: l,
        type,
        options:
          type === "select"
            ? optionsText.split(",").map((s) => s.trim()).filter(Boolean)
            : undefined,
      })
      setLabel("")
      setOptionsText("")
      setType("text")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save the field."))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Custom task fields</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-1">
            {(defs ?? []).map((d) => (
              <li
                key={d._id}
                className="hover:bg-muted/40 flex items-center gap-2 rounded-md px-2 py-1.5"
              >
                <IconGripVertical className="text-muted-foreground/30 size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm">{d.label}</span>
                <span className="text-muted-foreground text-[11px]">
                  {TYPE_LABELS[d.type]}
                </span>
                <Switch
                  checked={d.active}
                  onCheckedChange={(v) =>
                    save({
                      fieldId: d._id,
                      label: d.label,
                      type: d.type,
                      options: d.options,
                      active: v,
                    }).catch(() => toast.error("Couldn't update."))
                  }
                  aria-label="Active"
                />
                <button
                  type="button"
                  onClick={() =>
                    remove({ fieldId: d._id }).catch(() =>
                      toast.error("Couldn't remove."),
                    )
                  }
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  title="Delete field"
                >
                  <IconTrash className="size-3.5" />
                </button>
              </li>
            ))}
            {(defs ?? []).length === 0 && (
              <p className="text-muted-foreground py-2 text-center text-xs">
                No custom fields yet.
              </p>
            )}
          </ul>

          <div className="flex flex-col gap-2 border-t pt-3">
            <Label className="text-xs">Add a field</Label>
            <div className="flex items-center gap-2">
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Field label…"
                className="h-8"
              />
              <Select value={type} onValueChange={(v) => setType(v as FieldDef["type"])}>
                <SelectTrigger className="h-8 w-36 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABELS) as FieldDef["type"][]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {type === "select" && (
              <Input
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder="Options, comma-separated"
                className="h-8"
              />
            )}
            <Button size="sm" onClick={add} className="self-start">
              <IconPlus className="size-4" />
              Add field
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
