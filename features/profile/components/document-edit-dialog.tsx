"use client"

import { getErrorMessage } from "@/lib/errors"
import * as React from "react"
import { useMutation } from "convex/react"
import { IconFile, IconTrash, IconArrowBackUp } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { FunctionReturnType } from "convex/server"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type DocGroup = FunctionReturnType<typeof api.employeeDocuments.list>[number]

export function DocumentEditDialog({
  open,
  onOpenChange,
  doc,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  doc: DocGroup
}) {
  const update = useMutation(api.employeeDocuments.update)
  const [name, setName] = React.useState(doc.name)
  const [note, setNote] = React.useState(doc.note ?? "")
  const [remove, setRemove] = React.useState<Set<Id<"_storage">>>(new Set())
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setName(doc.name)
      setNote(doc.note ?? "")
      setRemove(new Set())
    }
  }, [open, doc])

  const remaining = doc.files.length - remove.size

  function toggle(id: Id<"_storage">) {
    setRemove((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    if (!name.trim()) return toast.error("Give the document a name.")
    if (remaining < 1)
      return toast.error("Keep at least one file, or delete the whole document.")
    setSaving(true)
    try {
      await update({
        documentId: doc._id,
        name: name.trim(),
        note: note.trim(),
        removeStorageIds: [...remove],
      })
      toast.success("Document updated")
      onOpenChange(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not save"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit document</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Note</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs">Files ({remaining} kept)</Label>
            <div className="flex flex-wrap gap-3">
              {doc.files.map((f) => {
                const flagged = remove.has(f.storageId)
                return (
                  <div
                    key={f.storageId}
                    className={cn(
                      "relative flex flex-col items-center gap-1",
                      flagged && "opacity-40",
                    )}
                  >
                    <div className="bg-muted size-24 overflow-hidden rounded-md border">
                      {f.isImage && f.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.url} alt={f.name} className="size-full object-cover" />
                      ) : (
                        <div className="text-muted-foreground flex size-full items-center justify-center">
                          <IconFile className="size-7" />
                        </div>
                      )}
                    </div>
                    <span className="max-w-24 truncate text-xs">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => toggle(f.storageId)}
                      className="bg-background absolute right-1 top-1 rounded-full border p-1 shadow"
                      title={flagged ? "Keep file" : "Remove file"}
                    >
                      {flagged ? (
                        <IconArrowBackUp className="size-3.5" />
                      ) : (
                        <IconTrash className="text-destructive size-3.5" />
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
            <p className="text-muted-foreground text-xs">
              Files flagged with the bin will be deleted on save.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
