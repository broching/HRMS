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

type VehicleRate = { id: string; label: string; ratePerKmCents: number }
type MileageSettings = {
  ratePerKmCents?: number
  vehicleRates?: VehicleRate[]
  maxDistanceKm?: number
}
type OfficeRow = {
  _id: Id<"offices">
  name: string
  defaultCurrency?: string
  isDefault?: boolean
  mileageSettings?: MileageSettings
}

// One editable vehicle-type rate row in the office dialog (amounts kept as
// display strings while editing; parsed to cents on save).
type VehicleRateRow = { id: string; label: string; rate: string }

function newVehicleRowId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `v${Date.now()}${Math.random().toString(36).slice(2)}`
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
  const [rate, setRate] = React.useState("")
  const [maxDistance, setMaxDistance] = React.useState("")
  const [vehicleRates, setVehicleRates] = React.useState<VehicleRateRow[]>([])
  const [busy, setBusy] = React.useState(false)

  // Seed the fields whenever the dialog opens.
  React.useEffect(() => {
    if (open) {
      setName(office?.name ?? "")
      setCurrency(office?.defaultCurrency ?? "SGD")
      const mileage = office?.mileageSettings
      setRate(mileage?.ratePerKmCents != null ? String(mileage.ratePerKmCents / 100) : "")
      setMaxDistance(mileage?.maxDistanceKm != null ? String(mileage.maxDistanceKm) : "")
      setVehicleRates(
        (mileage?.vehicleRates ?? []).map((v) => ({
          id: v.id,
          label: v.label,
          rate: String(v.ratePerKmCents / 100),
        })),
      )
    }
  }, [open, office])

  function addVehicleRow() {
    setVehicleRates((rows) => [...rows, { id: newVehicleRowId(), label: "", rate: "" }])
  }
  function updateVehicleRow(id: string, patch: Partial<VehicleRateRow>) {
    setVehicleRates((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
  function removeVehicleRow(id: string) {
    setVehicleRates((rows) => rows.filter((r) => r.id !== id))
  }

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error("Office name is required.")
      return
    }
    const cleanVehicleRates = vehicleRates
      .filter((r) => r.label.trim() && r.rate !== "")
      .map((r) => ({
        id: r.id,
        label: r.label.trim(),
        ratePerKmCents: Math.round(Number(r.rate) * 100),
      }))
    const mileageSettings: MileageSettings = {
      ratePerKmCents: rate !== "" ? Math.round(Number(rate) * 100) : undefined,
      vehicleRates: cleanVehicleRates.length ? cleanVehicleRates : undefined,
      maxDistanceKm: maxDistance !== "" ? Number(maxDistance) : undefined,
    }
    const hasMileageSettings =
      mileageSettings.ratePerKmCents != null ||
      mileageSettings.vehicleRates != null ||
      mileageSettings.maxDistanceKm != null
    setBusy(true)
    try {
      if (office) {
        await update({
          id: office._id,
          name: trimmed,
          defaultCurrency: currency,
          mileageSettings: hasMileageSettings ? mileageSettings : undefined,
        })
        toast.success("Office updated")
      } else {
        await create({
          name: trimmed,
          timezone: "Asia/Singapore",
          defaultCurrency: currency,
          mileageSettings: hasMileageSettings ? mileageSettings : undefined,
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
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

          <div className="flex flex-col gap-3 rounded-lg border p-3">
            <div>
              <Label className="text-sm font-medium">Mileage claim settings</Label>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Used to compute reimbursement for mileage-type claims from
                employees assigned to this office.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Flat rate per km ({currency})</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">
                  Rates by vehicle type (optional — overrides the flat rate)
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                  onClick={addVehicleRow}
                >
                  <IconPlus className="size-3.5" />
                  Add
                </Button>
              </div>
              {vehicleRates.map((row) => (
                <div key={row.id} className="flex items-center gap-2">
                  <Input
                    placeholder="e.g. Car"
                    value={row.label}
                    onChange={(e) => updateVehicleRow(row.id, { label: e.target.value })}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={row.rate}
                    onChange={(e) => updateVehicleRow(row.id, { rate: e.target.value })}
                    className="w-24"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive size-8 shrink-0"
                    aria-label="Remove vehicle rate"
                    onClick={() => removeVehicleRow(row.id)}
                  >
                    <IconTrash className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Maximum reimbursable distance (km, optional)</Label>
              <Input
                type="number"
                min="0"
                step="1"
                placeholder="No limit"
                value={maxDistance}
                onChange={(e) => setMaxDistance(e.target.value)}
              />
            </div>
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

// Delete-office flow: blocks deletion while the office still has members,
// listing them and offering a bulk "move to another office" action that
// reassigns everyone in one go before deleting.
function DeleteOfficeDialog({
  office,
  offices,
  onOpenChange,
}: {
  office: OfficeRow | null
  offices: OfficeRow[]
  onOpenChange: (open: boolean) => void
}) {
  const members = useQuery(
    api.offices.membersOf,
    office ? { id: office._id } : "skip",
  )
  const reassignMembers = useMutation(api.offices.reassignMembers)
  const removeOffice = useMutation(api.offices.remove)
  const [targetOfficeId, setTargetOfficeId] = React.useState<string>("")
  const [busy, setBusy] = React.useState(false)

  const otherOffices = React.useMemo(
    () => offices.filter((o) => o._id !== office?._id),
    [offices, office],
  )

  React.useEffect(() => {
    if (office) setTargetOfficeId(otherOffices[0]?._id ?? "")
  }, [office, otherOffices])

  const hasMembers = (members?.length ?? 0) > 0

  async function reassignAndDelete() {
    if (!office || !targetOfficeId || !members) return
    setBusy(true)
    try {
      await reassignMembers({
        employeeIds: members.map((m) => m._id),
        toOfficeId: targetOfficeId as Id<"offices">,
      })
      await removeOffice({ id: office._id })
      toast.success("Members reassigned and office deleted")
      onOpenChange(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't reassign members"))
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!office) return
    setBusy(true)
    try {
      await removeOffice({ id: office._id })
      toast.success("Office deleted")
      onOpenChange(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't delete office"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={office !== null}
      onOpenChange={(o) => !busy && !o && onOpenChange(false)}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete office?</DialogTitle>
          <DialogDescription>
            {hasMembers
              ? `"${office?.name}" still has members assigned. Move them to another office to continue.`
              : `Delete "${office?.name}"? This can't be undone.`}
          </DialogDescription>
        </DialogHeader>

        {members === undefined ? (
          <p className="text-muted-foreground text-sm">Checking members…</p>
        ) : hasMembers ? (
          <div className="flex flex-col gap-3">
            <div className="max-h-40 divide-y overflow-y-auto rounded-md border text-sm">
              {members.map((m) => (
                <div
                  key={m._id}
                  className="flex items-center justify-between p-2 pl-3"
                >
                  <span>{m.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {m.employeeNumber}
                  </span>
                </div>
              ))}
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">
                Move all {members.length} member{members.length === 1 ? "" : "s"}{" "}
                to
              </Label>
              {otherOffices.length === 0 ? (
                <p className="text-destructive text-xs">
                  No other office exists to move them to — add one first.
                </p>
              ) : (
                <Select value={targetOfficeId} onValueChange={setTargetOfficeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an office" />
                  </SelectTrigger>
                  <SelectContent>
                    {otherOffices.map((o) => (
                      <SelectItem key={o._id} value={o._id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          {hasMembers ? (
            <Button
              variant="destructive"
              disabled={busy || !targetOfficeId || otherOffices.length === 0}
              onClick={reassignAndDelete}
            >
              {busy ? "Reassigning…" : "Reassign & delete"}
            </Button>
          ) : (
            <Button
              variant="destructive"
              disabled={busy || members === undefined}
              onClick={confirmDelete}
            >
              {busy ? "Deleting…" : "Delete"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function OfficesManager() {
  const offices = useQuery(api.offices.list)
  const ensureDefault = useMutation(api.offices.ensureDefault)

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<OfficeRow | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = React.useState<OfficeRow | null>(null)

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

      <DeleteOfficeDialog
        office={deleteTarget}
        offices={offices ?? []}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      />
    </>
  )
}
