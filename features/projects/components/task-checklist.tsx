"use client"

import * as React from "react"
import { useMutation } from "convex/react"
import { IconPlus, IconTrash, IconGripVertical } from "@tabler/icons-react"
import { toast } from "sonner"
import { getErrorMessage } from "@/lib/errors"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"

export type ChecklistItem = { id: string; text: string; done: boolean; order: number }

/**
 * Lightweight checklist block for a task — add a step, tick it, rename inline, or
 * remove it. Editable by anyone who can edit the task (managers or assignees).
 */
export function TaskChecklist({
  taskId,
  items,
  canEdit,
}: {
  taskId: Id<"projectTasks">
  items: ChecklistItem[]
  canEdit: boolean
}) {
  const add = useMutation(api.projects.addChecklistItem)
  const toggle = useMutation(api.projects.toggleChecklistItem)
  const rename = useMutation(api.projects.renameChecklistItem)
  const remove = useMutation(api.projects.removeChecklistItem)

  const [newText, setNewText] = React.useState("")
  const [adding, setAdding] = React.useState(false)

  const sorted = React.useMemo(
    () => [...items].sort((a, b) => a.order - b.order),
    [items],
  )
  const done = sorted.filter((i) => i.done).length
  const total = sorted.length
  const pct = total ? Math.round((done / total) * 100) : 0

  async function addItem() {
    const text = newText.trim()
    if (!text) return
    setAdding(true)
    try {
      await add({ taskId, text })
      setNewText("")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't add the item."))
    } finally {
      setAdding(false)
    }
  }

  if (total === 0 && !canEdit) return null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
          Checklist{total > 0 ? ` · ${done}/${total}` : ""}
        </Label>
      </div>
      {total > 0 && (
        <div className="bg-muted h-1.5 overflow-hidden rounded-full">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      <ul className="flex flex-col gap-0.5">
        {sorted.map((item) => (
          <ChecklistRow
            key={item.id}
            item={item}
            canEdit={canEdit}
            onToggle={(done) =>
              toggle({ taskId, itemId: item.id, done }).catch(() =>
                toast.error("Couldn't update the item."),
              )
            }
            onRename={(text) =>
              rename({ taskId, itemId: item.id, text }).catch((e) =>
                toast.error(getErrorMessage(e, "Couldn't rename the item.")),
              )
            }
            onRemove={() =>
              remove({ taskId, itemId: item.id }).catch(() =>
                toast.error("Couldn't remove the item."),
              )
            }
          />
        ))}
      </ul>
      {canEdit && (
        <div className="flex items-center gap-2">
          <IconPlus className="text-muted-foreground size-4 shrink-0" />
          <Input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void addItem()
              }
            }}
            onBlur={() => newText.trim() && addItem()}
            placeholder="Add a checklist item…"
            disabled={adding}
            className="h-8 border-transparent bg-transparent px-1 shadow-none focus-visible:border-input focus-visible:bg-background"
          />
        </div>
      )}
    </div>
  )
}

function ChecklistRow({
  item,
  canEdit,
  onToggle,
  onRename,
  onRemove,
}: {
  item: ChecklistItem
  canEdit: boolean
  onToggle: (done: boolean) => void
  onRename: (text: string) => void
  onRemove: () => void
}) {
  const [text, setText] = React.useState(item.text)
  React.useEffect(() => setText(item.text), [item.text])

  return (
    <li className="group hover:bg-muted/40 flex items-center gap-2 rounded-md px-1 py-1">
      {canEdit && (
        <IconGripVertical className="text-muted-foreground/30 size-3.5 shrink-0" />
      )}
      <Checkbox
        checked={item.done}
        disabled={!canEdit}
        onCheckedChange={(v) => onToggle(v === true)}
        className="shrink-0"
      />
      {canEdit ? (
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const t = text.trim()
            if (t && t !== item.text) onRename(t)
            else setText(item.text)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur()
          }}
          className={cn(
            "min-w-0 flex-1 bg-transparent text-sm outline-none",
            item.done && "text-muted-foreground line-through",
          )}
        />
      ) : (
        <span
          className={cn(
            "min-w-0 flex-1 text-sm",
            item.done && "text-muted-foreground line-through",
          )}
        >
          {item.text}
        </span>
      )}
      {canEdit && (
        <button
          type="button"
          onClick={onRemove}
          title="Remove"
          className="text-muted-foreground/50 hover:text-destructive shrink-0 opacity-0 transition group-hover:opacity-100"
        >
          <IconTrash className="size-3.5" />
        </button>
      )}
    </li>
  )
}
