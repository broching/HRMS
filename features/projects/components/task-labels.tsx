"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import {
  IconTag,
  IconPlus,
  IconTrash,
  IconPencil,
  IconCheck,
  IconSettings,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { getErrorMessage } from "@/lib/errors"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

export const LABEL_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
  "#64748b",
]

export type Label = { _id: Id<"taskLabels">; name: string; color: string }

// A single label chip. Renders a coloured dot + name; optional remove button.
export function LabelChip({
  label,
  onRemove,
  className,
}: {
  label: { name: string; color: string }
  onRemove?: () => void
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        className,
      )}
      style={{
        borderColor: `${label.color}55`,
        backgroundColor: `${label.color}18`,
        color: label.color,
      }}
    >
      <span className="size-2 rounded-full" style={{ backgroundColor: label.color }} />
      {label.name}
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${label.name}`}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="hover:opacity-70"
        >
          ×
        </button>
      )}
    </span>
  )
}

/**
 * Multi-select label picker (dropdown). Toggles org labels on/off, supports
 * inline creation, and opens the label manager. Managers can create; everyone
 * can apply existing labels.
 */
export function LabelPicker({
  value,
  onChange,
  canManage,
}: {
  value: Id<"taskLabels">[]
  onChange: (next: Id<"taskLabels">[]) => void
  canManage: boolean
}) {
  const labels = useQuery(api.labels.list, {})
  const createLabel = useMutation(api.labels.create)
  const [newName, setNewName] = React.useState("")
  const [managerOpen, setManagerOpen] = React.useState(false)

  const selected = new Set(value)
  const selectedLabels = (labels ?? []).filter((l) => selected.has(l._id))

  function toggle(id: Id<"taskLabels">) {
    if (selected.has(id)) onChange(value.filter((x) => x !== id))
    else onChange([...value, id])
  }

  async function quickCreate() {
    const name = newName.trim()
    if (!name) return
    try {
      const color = LABEL_COLORS[(labels?.length ?? 0) % LABEL_COLORS.length]
      const id = await createLabel({ name, color })
      onChange([...value, id])
      setNewName("")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't create the label."))
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {selectedLabels.map((l) => (
          <LabelChip key={l._id} label={l} onRemove={() => toggle(l._id)} />
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1 px-2 text-xs">
              <IconTag className="size-3.5" />
              {selectedLabels.length === 0 ? "Add label" : "Edit"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 p-0">
            <div className="max-h-56 overflow-y-auto p-1">
              {(labels ?? []).length === 0 ? (
                <p className="text-muted-foreground px-2 py-3 text-center text-xs">
                  No labels yet.
                </p>
              ) : (
                (labels ?? []).map((l) => {
                  const on = selected.has(l._id)
                  return (
                    <button
                      key={l._id}
                      type="button"
                      onClick={() => toggle(l._id)}
                      className="hover:bg-accent/60 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm"
                    >
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: l.color }}
                      />
                      <span className="min-w-0 flex-1 truncate">{l.name}</span>
                      {on && <IconCheck className="text-primary size-4 shrink-0" />}
                    </button>
                  )
                })
              )}
            </div>
            {canManage && (
              <div className="border-t p-1.5">
                <div className="flex items-center gap-1">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        void quickCreate()
                      }
                    }}
                    placeholder="New label…"
                    className="h-7 text-xs"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 shrink-0"
                    onClick={quickCreate}
                  >
                    <IconPlus className="size-4" />
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground mt-1 h-7 w-full justify-start gap-1.5 text-xs"
                  onClick={() => setManagerOpen(true)}
                >
                  <IconSettings className="size-3.5" />
                  Manage labels
                </Button>
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <LabelManager open={managerOpen} onOpenChange={setManagerOpen} />
    </>
  )
}

/** Full CRUD dialog for the org's task labels. Managers only. */
export function LabelManager({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const labels = useQuery(api.labels.list, open ? {} : "skip")
  const createLabel = useMutation(api.labels.create)
  const updateLabel = useMutation(api.labels.update)
  const removeLabel = useMutation(api.labels.remove)

  const [name, setName] = React.useState("")
  const [color, setColor] = React.useState(LABEL_COLORS[5])

  async function add() {
    const n = name.trim()
    if (!n) return
    try {
      await createLabel({ name: n, color })
      setName("")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't create the label."))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Manage labels</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-1">
            {(labels ?? []).map((l) => (
              <LabelManagerRow
                key={l._id}
                label={l}
                onRename={(name) =>
                  updateLabel({ labelId: l._id, name }).catch((e) =>
                    toast.error(getErrorMessage(e, "Couldn't rename.")),
                  )
                }
                onRecolor={(color) =>
                  updateLabel({ labelId: l._id, color }).catch(() =>
                    toast.error("Couldn't recolor."),
                  )
                }
                onRemove={() =>
                  removeLabel({ labelId: l._id }).catch(() =>
                    toast.error("Couldn't remove."),
                  )
                }
              />
            ))}
            {(labels ?? []).length === 0 && (
              <p className="text-muted-foreground py-2 text-center text-xs">
                No labels yet — add one below.
              </p>
            )}
          </ul>

          <div className="flex flex-col gap-2 border-t pt-3">
            <div className="flex items-center gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    void add()
                  }
                }}
                placeholder="New label name…"
                className="h-8"
              />
              <Button size="sm" onClick={add}>
                <IconPlus className="size-4" />
                Add
              </Button>
            </div>
            <ColorSwatches value={color} onChange={setColor} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function LabelManagerRow({
  label,
  onRename,
  onRecolor,
  onRemove,
}: {
  label: Label
  onRename: (name: string) => void
  onRecolor: (color: string) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = React.useState(false)
  const [name, setName] = React.useState(label.name)
  React.useEffect(() => setName(label.name), [label.name])

  return (
    <li className="hover:bg-muted/40 flex items-center gap-2 rounded-md px-2 py-1.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="size-4 shrink-0 rounded-full ring-offset-1 hover:ring-2"
            style={{ backgroundColor: label.color }}
            aria-label="Change colour"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto">
          <ColorSwatches value={label.color} onChange={onRecolor} />
        </DropdownMenuContent>
      </DropdownMenu>
      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const t = name.trim()
            if (t && t !== label.name) onRename(t)
            setEditing(false)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur()
          }}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm">{label.name}</span>
      )}
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-muted-foreground hover:text-foreground shrink-0"
        title="Rename"
      >
        <IconPencil className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="text-muted-foreground hover:text-destructive shrink-0"
        title="Delete"
      >
        <IconTrash className="size-3.5" />
      </button>
    </li>
  )
}

function ColorSwatches({
  value,
  onChange,
}: {
  value: string
  onChange: (c: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5 p-1">
      {LABEL_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Colour ${c}`}
          className={cn(
            "size-5 rounded-full ring-offset-1 transition",
            value === c && "ring-primary ring-2",
          )}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  )
}
