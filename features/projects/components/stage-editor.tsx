"use client"

import { getErrorMessage } from "@/lib/errors"
import * as React from "react"
import { useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import {
  IconPlus,
  IconTrash,
  IconChevronUp,
  IconChevronDown,
  IconCheck,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
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
import { ConfirmDialog } from "@/features/claims/components/confirm-dialog"
import { cn } from "@/lib/utils"

type Stage = FunctionReturnType<typeof api.projects.board>["stages"][number]

const COLORS = [
  "#94a3b8",
  "#3b82f6",
  "#a855f7",
  "#22c55e",
  "#f97316",
  "#eab308",
  "#ec4899",
  "#14b8a6",
]

export function StageEditor({
  projectId,
  stages,
  open,
  onOpenChange,
}: {
  projectId: Id<"projects">
  stages: Stage[]
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const createStage = useMutation(api.projects.createStage)
  const updateStage = useMutation(api.projects.updateStage)
  const reorderStages = useMutation(api.projects.reorderStages)
  const deleteStage = useMutation(api.projects.deleteStage)

  const [newName, setNewName] = React.useState("")
  const [deleting, setDeleting] = React.useState<Stage | null>(null)
  const [reassignTo, setReassignTo] = React.useState<string>("")
  const [busy, setBusy] = React.useState(false)

  async function move(index: number, dir: -1 | 1) {
    const next = [...stages]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    try {
      await reorderStages({ projectId, orderedStageIds: next.map((s) => s._id) })
    } catch {
      toast.error("Couldn't reorder columns.")
    }
  }

  async function add() {
    if (!newName.trim()) return
    try {
      await createStage({ projectId, name: newName })
      setNewName("")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't add the column."))
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage columns</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-2 py-1">
            {stages.map((s, i) => (
              <div
                key={s._id}
                className="flex items-center gap-2 rounded-md border p-2"
              >
                <ColorSwatch
                  color={s.color ?? COLORS[0]}
                  onChange={(color) => updateStage({ stageId: s._id, color })}
                />
                <Input
                  defaultValue={s.name}
                  className="h-8 flex-1"
                  onBlur={(e) => {
                    const name = e.target.value.trim()
                    if (name && name !== s.name) updateStage({ stageId: s._id, name })
                  }}
                />
                <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <Switch
                    checked={s.isDone}
                    onCheckedChange={(isDone) => updateStage({ stageId: s._id, isDone })}
                  />
                  Done
                </label>
                <div className="flex flex-col">
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <IconChevronUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    disabled={i === stages.length - 1}
                    onClick={() => move(i, 1)}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                  >
                    <IconChevronDown className="size-4" />
                  </button>
                </div>
                <button
                  type="button"
                  disabled={stages.length <= 1}
                  onClick={() => {
                    setDeleting(s)
                    setReassignTo(stages.find((x) => x._id !== s._id)?._id ?? "")
                  }}
                  className="text-muted-foreground hover:text-destructive disabled:opacity-30"
                  title="Delete column"
                >
                  <IconTrash className="size-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 border-t pt-3">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New column name"
              className="h-8"
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
            <Button size="sm" onClick={add} disabled={!newName.trim()}>
              <IconPlus className="size-4" />
              Add
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        description={
          <div className="flex flex-col gap-3">
            <p>Tasks in this column will be moved to another column.</p>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Move tasks to</Label>
              <Select value={reassignTo} onValueChange={setReassignTo}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a column" />
                </SelectTrigger>
                <SelectContent>
                  {stages
                    .filter((s) => s._id !== deleting?._id)
                    .map((s) => (
                      <SelectItem key={s._id} value={s._id}>
                        {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        }
        confirmLabel="Delete column"
        destructive
        busy={busy}
        onConfirm={async () => {
          if (!deleting || !reassignTo) return
          setBusy(true)
          try {
            await deleteStage({
              stageId: deleting._id,
              reassignToStageId: reassignTo as Id<"projectStages">,
            })
            setDeleting(null)
          } catch (e) {
            toast.error(getErrorMessage(e, "Couldn't delete the column."))
          } finally {
            setBusy(false)
          }
        }}
      />
    </>
  )
}

function ColorSwatch({
  color,
  onChange,
}: {
  color: string
  onChange: (c: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="size-5 rounded-full ring-1 ring-black/10"
        style={{ backgroundColor: color }}
        aria-label="Column colour"
      />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="bg-popover absolute top-6 left-0 z-20 flex w-32 flex-wrap gap-1.5 rounded-md border p-2 shadow-md">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onChange(c)
                  setOpen(false)
                }}
                className="flex size-5 items-center justify-center rounded-full"
                style={{ backgroundColor: c }}
              >
                {c === color && <IconCheck className="size-3 text-white" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
