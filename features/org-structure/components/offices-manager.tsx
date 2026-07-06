"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { IconTrash, IconPlus, IconPencil, IconLock } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { CURRENCIES } from "@/features/claims/lib/labels"
import { getErrorMessage } from "@/lib/errors"

type OfficeRow = {
  _id: Id<"offices">
  name: string
  defaultCurrency?: string
  isDefault?: boolean
}

// Add/edit dialog for one office. `office` undefined = creating a new one.
function OfficeDialog({
  open,
  onOpenChange,
  office,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  office?: OfficeRow
}) {
  const create = useMutation(api.offices.create)
  const update = useMutation(api.offices.update)
  const [name, setName] = React.useState("")
  const [currency, setCurrency] = React.useState("SGD")
  const [busy, setBusy] = React.useState(false)

  // Seed the fields whenever the dialog opens.
  React.useEffect(() => {
    if (open) {
      setName(office?.name ?? "")
      setCurrency(office?.defaultCurrency ?? "SGD")
    }
  }, [open, office])

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error("Office name is required.")
      return
    }
    setBusy(true)
    try {
      if (office) {
        await update({ id: office._id, name: trimmed, defaultCurrency: currency })
        toast.success("Office updated")
      } else {
        await create({
          name: trimmed,
          timezone: "Asia/Singapore",
          defaultCurrency: currency,
        })
        toast.success("Office added")
      }
      onOpenChange(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save office"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{office ? "Edit office" : "Add office"}</DialogTitle>
          <DialogDescription>
            The default currency is the base currency for claims made by
            employees assigned to this office.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input
              value={name}
              placeholder="e.g. Kuala Lumpur"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Default currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : office ? "Save changes" : "Add office"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function OfficesManager() {
  const offices = useQuery(api.offices.list)
  const ensureDefault = useMutation(api.offices.ensureDefault)
  const removeOffice = useMutation(api.offices.remove)

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<OfficeRow | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = React.useState<OfficeRow | null>(null)
  const [busy, setBusy] = React.useState(false)

  // Backfill the protected default office for orgs created before it existed.
  React.useEffect(() => {
    if (offices !== undefined && !offices.some((o) => o.isDefault)) {
      ensureDefault({}).catch(() => {})
    }
  }, [offices, ensureDefault])

  function openAdd() {
    setEditing(undefined)
    setDialogOpen(true)
  }
  function openEdit(o: OfficeRow) {
    setEditing(o)
    setDialogOpen(true)
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await removeOffice({ id: deleteTarget._id })
      toast.success("Office deleted")
      setDeleteTarget(null)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't delete office"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Offices</CardTitle>
          <Button size="sm" onClick={openAdd}>
            <IconPlus className="size-4" />
            Add
          </Button>
        </CardHeader>
        <CardContent>
          <div className="divide-y rounded-md border">
            {offices === undefined ? (
              <p className="text-muted-foreground p-3 text-sm">Loading…</p>
            ) : offices.length === 0 ? (
              <p className="text-muted-foreground p-3 text-sm">None yet.</p>
            ) : (
              offices.map((o) => (
                <div
                  key={o._id}
                  className="flex items-center justify-between gap-2 p-2 pl-3 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{o.name}</span>
                    <Badge variant="secondary">
                      {o.defaultCurrency ?? "SGD"}
                    </Badge>
                    {o.isDefault && (
                      <Badge variant="outline" className="gap-1">
                        <IconLock className="size-3" />
                        Default
                      </Badge>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label="Edit office"
                      onClick={() => openEdit(o)}
                    >
                      <IconPencil className="size-4" />
                    </Button>
                    {!o.isDefault && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive size-7"
                        aria-label="Delete office"
                        onClick={() => setDeleteTarget(o)}
                      >
                        <IconTrash className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <OfficeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        office={editing}
      />

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !busy && !o && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete office?</DialogTitle>
            <DialogDescription>
              Delete “{deleteTarget?.name}”? Employees assigned to it keep their
              claims but will need reassigning to another office.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button variant="destructive" disabled={busy} onClick={confirmDelete}>
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
