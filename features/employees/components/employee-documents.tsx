"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { IconFile, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { FileUpload } from "@/components/shared/file-upload"

const DOC_TYPES = [
  { value: "contract", label: "Contract" },
  { value: "certification", label: "Certification" },
  { value: "work_pass", label: "Work pass" },
  { value: "other", label: "Other" },
] as const

type DocType = (typeof DOC_TYPES)[number]["value"]

export function EmployeeDocuments({
  employeeId,
  canManage,
}: {
  employeeId: Id<"employees">
  canManage: boolean
}) {
  const docs = useQuery(api.employeeDocuments.list, { employeeId })
  const add = useMutation(api.employeeDocuments.add)
  const remove = useMutation(api.employeeDocuments.remove)
  const [type, setType] = React.useState<DocType>("contract")

  async function handleUploaded(storageId: Id<"_storage">, file: File) {
    try {
      await add({ employeeId, type, name: file.name, storageId })
      toast.success("Document added")
    } catch {
      toast.error("Could not add document")
    }
  }

  async function handleRemove(documentId: Id<"employeeDocuments">) {
    try {
      await remove({ documentId })
      toast.success("Document removed")
    } catch {
      toast.error("Could not remove document")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <div className="flex items-center gap-2">
          <Select value={type} onValueChange={(v) => setType(v as DocType)}>
            <SelectTrigger className="w-44">
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
          <FileUpload label="Upload document" onUploaded={handleUploaded} />
        </div>
      )}

      <div className="rounded-lg border divide-y">
        {docs === undefined ? (
          <div className="p-4">
            <Skeleton className="h-6 w-full" />
          </div>
        ) : docs.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm">No documents.</p>
        ) : (
          docs.map((d) => (
            <div
              key={d._id}
              className="flex items-center justify-between gap-3 p-3"
            >
              <a
                href={d.url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-sm hover:underline"
              >
                <IconFile className="text-muted-foreground size-4" />
                {d.name}
              </a>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  {d.type.replace("_", " ")}
                </Badge>
                {d.expiryDate && (
                  <span className="text-muted-foreground text-xs">
                    exp {d.expiryDate}
                  </span>
                )}
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => handleRemove(d._id)}
                  >
                    <IconTrash className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
