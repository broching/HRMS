"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { IconPlus, IconPencil, IconTrash, IconDeviceLaptop } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { FunctionReturnType } from "convex/server"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EquipmentDialog } from "./equipment-dialog"

type EquipmentItem = FunctionReturnType<
  typeof api.equipment.listForEmployee
>[number]

export function EquipmentSection({
  employeeId,
  canManage,
}: {
  employeeId: Id<"employees">
  canManage: boolean
}) {
  const items = useQuery(api.equipment.listForEmployee, { employeeId })
  const remove = useMutation(api.equipment.remove)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<EquipmentItem | null>(null)

  async function handleDelete(id: Id<"equipment">) {
    try {
      await remove({ equipmentId: id })
    } catch {
      toast.error("Could not delete")
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Equipment</h2>
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

      {items === undefined ? (
        <Skeleton className="h-24 w-full rounded-lg" />
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No equipment assigned.</p>
      ) : (
        <div className="rounded-lg border divide-y">
          {items.map((e) => (
            <div key={e._id} className="flex items-center justify-between gap-3 p-3">
              <div className="flex items-center gap-3">
                <IconDeviceLaptop className="text-muted-foreground size-5 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {e.name}
                    {e.category && (
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        · {e.category}
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {[
                      e.serialNumber ? `SN ${e.serialNumber}` : null,
                      e.assignedDate ? `Assigned ${e.assignedDate}` : null,
                      e.returnedDate ? `Returned ${e.returnedDate}` : null,
                      e.note,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={e.status === "assigned" ? "default" : "secondary"}>
                  {e.status === "assigned" ? "Assigned" : "Returned"}
                </Badge>
                {canManage && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => {
                        setEditing(e)
                        setDialogOpen(true)
                      }}
                    >
                      <IconPencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive size-8"
                      onClick={() => handleDelete(e._id)}
                    >
                      <IconTrash className="size-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <EquipmentDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          employeeId={employeeId}
          initial={editing}
        />
      )}
    </section>
  )
}
