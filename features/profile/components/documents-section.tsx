"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { IconFile, IconTrash, IconUpload, IconPencil } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { DocumentUploadDialog, DOC_TYPES } from "./document-upload-dialog"
import { DocumentEditDialog } from "./document-edit-dialog"

type DocGroup = FunctionReturnType<typeof api.employeeDocuments.list>[number]

const TYPE_LABEL = Object.fromEntries(DOC_TYPES.map((t) => [t.value, t.label]))

export function DocumentsSection({
  employeeId,
  canUpload,
}: {
  employeeId: Id<"employees">
  canUpload: boolean
}) {
  const docs = useQuery(api.employeeDocuments.list, { employeeId })
  const remove = useMutation(api.employeeDocuments.remove)
  const [uploadOpen, setUploadOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<DocGroup | null>(null)

  async function handleRemove(documentId: Id<"employeeDocuments">) {
    try {
      await remove({ documentId })
      toast.success("Document removed")
    } catch {
      toast.error("Could not remove document")
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Documents</h2>
        {canUpload && (
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <IconUpload className="size-4" />
            Upload document
          </Button>
        )}
      </div>

      {docs === undefined ? (
        <Skeleton className="h-24 w-full rounded-lg" />
      ) : docs.length === 0 ? (
        <p className="text-muted-foreground text-sm">No documents.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {docs.map((d) => (
            <div key={d._id} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{d.name}</span>
                  {d.note && (
                    <span className="text-muted-foreground text-xs">{d.note}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{TYPE_LABEL[d.type] ?? d.type}</Badge>
                  {d.expiryDate && (
                    <span className="text-muted-foreground text-xs">
                      exp {d.expiryDate}
                    </span>
                  )}
                  {canUpload && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => setEditing(d)}
                      >
                        <IconPencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive size-7"
                        onClick={() => handleRemove(d._id)}
                      >
                        <IconTrash className="size-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {d.files.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-3">
                  {d.files.map((f) =>
                    f.isImage && f.url ? (
                      <a
                        key={f.storageId}
                        href={f.url}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-muted block size-24 overflow-hidden rounded-md border"
                        title={f.name}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={f.url}
                          alt={f.name}
                          className="size-full object-cover"
                        />
                      </a>
                    ) : (
                      <a
                        key={f.storageId}
                        href={f.url ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:bg-accent/40 flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                      >
                        <IconFile className="text-muted-foreground size-4" />
                        <span className="max-w-[12rem] truncate">{f.name}</span>
                      </a>
                    ),
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {canUpload && (
        <DocumentUploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          employeeId={employeeId}
        />
      )}
      {canUpload && editing && (
        <DocumentEditDialog
          open={editing !== null}
          onOpenChange={(o) => !o && setEditing(null)}
          doc={editing}
        />
      )}
    </section>
  )
}
