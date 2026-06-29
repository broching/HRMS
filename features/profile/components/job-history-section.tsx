"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { IconPlus, IconPencil, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { FunctionReturnType } from "convex/server"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { EMPLOYMENT_TYPE_LABELS } from "@/features/employees/lib/labels"
import { JobEntryDialog } from "./job-entry-dialog"

type JobRow = FunctionReturnType<typeof api.jobHistory.listForEmployee>[number]

function fmtDate(value: string): string {
  const d = new Date(`${value}T00:00:00`)
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
}

export function JobHistorySection({
  employeeId,
  canManage,
}: {
  employeeId: Id<"employees">
  canManage: boolean
}) {
  const rows = useQuery(api.jobHistory.listForEmployee, { employeeId })
  const remove = useMutation(api.jobHistory.remove)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<JobRow | null>(null)

  async function handleDelete(id: Id<"jobHistory">) {
    try {
      await remove({ jobHistoryId: id })
    } catch {
      toast.error("Could not delete")
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Job information</h2>
        {canManage && (
          <Button
            size="sm"
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
          >
            <IconPlus className="size-4" />
            Add
          </Button>
        )}
      </div>

      {rows === undefined ? (
        <Skeleton className="h-32 w-full rounded-lg" />
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">No job history recorded.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs uppercase">
                <th className="py-2 pr-4 font-medium">Job title</th>
                <th className="py-2 pr-4 font-medium">Effective date</th>
                <th className="py-2 pr-4 font-medium">Department</th>
                <th className="py-2 pr-4 font-medium">Office</th>
                <th className="py-2 pr-4 font-medium">Manager</th>
                {canManage && <th className="py-2" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id} className="border-b last:border-0">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          r.isCurrent ? "bg-primary" : "bg-transparent",
                        )}
                        aria-hidden
                      />
                      <div className="flex flex-col">
                        <span className="font-medium">{r.title ?? "—"}</span>
                        {r.employmentType && (
                          <span className="text-muted-foreground text-xs">
                            {EMPLOYMENT_TYPE_LABELS[r.employmentType]}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-4">{fmtDate(r.effectiveDate)}</td>
                  <td className="text-muted-foreground py-3 pr-4">
                    {r.departmentName ?? "—"}
                  </td>
                  <td className="text-muted-foreground py-3 pr-4">
                    {r.officeName ?? "—"}
                  </td>
                  <td className="py-3 pr-4">
                    {r.managerName ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="size-6">
                          <AvatarImage src={r.managerPhotoUrl ?? undefined} />
                          <AvatarFallback className="text-[10px]">
                            {r.managerInitials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-muted-foreground">
                          {r.managerName}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  {canManage && (
                    <td className="py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => {
                            setEditing(r)
                            setDialogOpen(true)
                          }}
                        >
                          <IconPencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive size-8"
                          onClick={() => handleDelete(r._id)}
                        >
                          <IconTrash className="size-4" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canManage && (
        <JobEntryDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          employeeId={employeeId}
          initial={editing}
        />
      )}
    </section>
  )
}
