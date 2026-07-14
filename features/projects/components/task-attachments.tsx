"use client"

import * as React from "react"
import { useMutation } from "convex/react"
import { IconPaperclip, IconX, IconCamera, IconUpload } from "@tabler/icons-react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"

export type TaskAttachment = { id: Id<"_storage">; name: string }

// 10 MB per file — matches the app's other upload surfaces and keeps storage
// sane. The server also caps the total count per task.
const MAX_FILE_BYTES = 10 * 1024 * 1024

/**
 * Attachment picker for a task. Uploads images/PDFs (or a camera photo) to
 * Convex storage and reports the resulting storage ids upward. Enforces a per-
 * file size limit here; the total count cap (`max`) is enforced both here and on
 * the server.
 */
export function TaskAttachmentsPicker({
  value,
  onChange,
  max = 8,
}: {
  value: TaskAttachment[]
  onChange: (next: TaskAttachment[]) => void
  max?: number
}) {
  const generateUrl = useMutation(api.projects.generateUploadUrl)
  const fileRef = React.useRef<HTMLInputElement>(null)
  const cameraRef = React.useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = React.useState(false)

  const remaining = max - value.length
  const full = remaining <= 0

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    let picked = Array.from(files)
    if (picked.length > remaining) {
      toast.error(`You can attach at most ${max} files.`)
      picked = picked.slice(0, remaining)
    }
    const tooBig = picked.filter((f) => f.size > MAX_FILE_BYTES)
    if (tooBig.length > 0) {
      toast.error("Each file must be 10 MB or smaller.")
      picked = picked.filter((f) => f.size <= MAX_FILE_BYTES)
    }
    if (picked.length === 0) {
      if (fileRef.current) fileRef.current.value = ""
      if (cameraRef.current) cameraRef.current.value = ""
      return
    }
    setUploading(true)
    try {
      const uploaded: TaskAttachment[] = []
      for (const file of picked) {
        const url = await generateUrl()
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        })
        if (!res.ok) throw new Error("Upload failed")
        const { storageId } = (await res.json()) as { storageId: Id<"_storage"> }
        uploaded.push({ id: storageId, name: file.name || "Photo" })
      }
      onChange([...value, ...uploaded])
    } catch {
      toast.error("Upload failed")
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
      if (cameraRef.current) cameraRef.current.value = ""
    }
  }

  return (
    <div className="grid gap-2">
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={full || uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <IconUpload className="size-4" />
          )}
          Add file
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={full || uploading}
          onClick={() => cameraRef.current?.click()}
        >
          <IconCamera className="size-4" />
          Photo
        </Button>
        <span className="text-muted-foreground text-xs">
          {value.length}/{max} · max 10 MB each
        </span>
      </div>

      {value.length > 0 && (
        <ul className="flex flex-col gap-1">
          {value.map((r, i) => (
            <li
              key={`${r.id}-${i}`}
              className="text-muted-foreground flex items-center gap-1 text-xs"
            >
              <IconPaperclip className="size-3 shrink-0" />
              <span className="truncate">{r.name}</span>
              <button
                type="button"
                aria-label="Remove attachment"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                <IconX className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
