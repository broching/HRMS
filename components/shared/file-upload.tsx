"use client"

import * as React from "react"
import { useMutation } from "convex/react"
import { Upload, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"

/**
 * Uploads a file to Convex File Storage and hands back the resulting
 * storageId. Uses the shared employees.generateUploadUrl mutation (gated by
 * employees:manage). Re-usable across photo and document uploads.
 */
export function FileUpload({
  accept,
  label = "Upload file",
  onUploaded,
  disabled,
  generateUrl,
  maxBytes,
}: {
  accept?: string
  label?: string
  onUploaded: (storageId: Id<"_storage">, file: File) => void | Promise<void>
  disabled?: boolean
  /** Override the upload-URL source. Defaults to employees.generateUploadUrl. */
  generateUrl?: () => Promise<string>
  /** Reject files larger than this (bytes) before uploading. */
  maxBytes?: number
}) {
  const generateEmployeeUploadUrl = useMutation(api.employees.generateUploadUrl)
  const generateUploadUrl = generateUrl ?? generateEmployeeUploadUrl
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = React.useState(false)

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (maxBytes && file.size > maxBytes) {
      toast.error(
        `File is too large. Maximum size is ${Math.round(maxBytes / (1024 * 1024))} MB.`,
      )
      if (inputRef.current) inputRef.current.value = ""
      return
    }
    setUploading(true)
    try {
      const url = await generateUploadUrl()
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      })
      if (!res.ok) throw new Error("Upload failed")
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> }
      await onUploaded(storageId, file)
    } catch {
      toast.error("Upload failed")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleChange}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Upload className="size-4" />
        )}
        {label}
      </Button>
    </>
  )
}
