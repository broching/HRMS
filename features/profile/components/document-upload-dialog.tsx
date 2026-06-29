"use client"

import * as React from "react"
import { useMutation } from "convex/react"
import { IconX, IconPhoto, IconFile } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { FileUpload } from "@/components/shared/file-upload"
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

export const DOC_TYPES = [
  { value: "contract", label: "Contract" },
  { value: "identity", label: "Identity document" },
  { value: "certification", label: "Certification" },
  { value: "work_pass", label: "Work pass" },
  { value: "other", label: "Other" },
] as const

type DocType = (typeof DOC_TYPES)[number]["value"]
const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|svg|heic)$/i
const MAX_FILES = 3
const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

type PickedFile = { storageId: Id<"_storage">; name: string }

export function DocumentUploadDialog({
  open,
  onOpenChange,
  employeeId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  employeeId: Id<"employees">
}) {
  const add = useMutation(api.employeeDocuments.add)
  const [type, setType] = React.useState<DocType>("contract")
  const [name, setName] = React.useState("")
  const [note, setNote] = React.useState("")
  const [files, setFiles] = React.useState<PickedFile[]>([])
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setType("contract")
      setName("")
      setNote("")
      setFiles([])
    }
  }, [open])

  function onUploaded(storageId: Id<"_storage">, file: File) {
    setFiles((f) => (f.length >= MAX_FILES ? f : [...f, { storageId, name: file.name }]))
    setName((n) => n || file.name.replace(/\.[^.]+$/, ""))
  }

  async function submit() {
    if (files.length === 0) {
      toast.error("Attach at least one file.")
      return
    }
    if (!name.trim()) {
      toast.error("Give the document a name.")
      return
    }
    setSaving(true)
    try {
      await add({
        employeeId,
        type,
        name: name.trim(),
        note: note.trim() || undefined,
        storageIds: files.map((f) => f.storageId),
        fileNames: files.map((f) => f.name),
      })
      toast.success("Document added")
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add document")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
          <DialogDescription>
            Attach up to {MAX_FILES} files (e.g. an IC front and back) with a note.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as DocType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. NRIC"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Note (optional)</Label>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label className="text-xs">
              Files {files.length}/{MAX_FILES}
            </Label>
            {files.length > 0 && (
              <div className="flex flex-col gap-1">
                {files.map((f, i) => (
                  <div
                    key={f.storageId}
                    className="bg-muted/40 flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm"
                  >
                    <span className="flex items-center gap-2 truncate">
                      {IMAGE_RE.test(f.name) ? (
                        <IconPhoto className="text-muted-foreground size-4 shrink-0" />
                      ) : (
                        <IconFile className="text-muted-foreground size-4 shrink-0" />
                      )}
                      <span className="truncate">{f.name}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setFiles((fs) => fs.filter((_, idx) => idx !== i))
                      }
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <IconX className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {files.length < MAX_FILES && (
              <FileUpload
                label="Add file"
                maxBytes={MAX_BYTES}
                onUploaded={onUploaded}
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving || files.length === 0}>
            {saving ? "Saving…" : "Save document"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
