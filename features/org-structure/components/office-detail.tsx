"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery, useMutation } from "convex/react"
import {
  IconChevronLeft,
  IconPlus,
  IconTrash,
  IconSearch,
  IconLock,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CURRENCIES } from "@/features/claims/lib/labels"
import { getErrorMessage } from "@/lib/errors"

type VehicleRateRow = { id: string; label: string; rate: string }

function newVehicleRowId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `v${Date.now()}${Math.random().toString(36).slice(2)}`
}

// One member row: shows the employee and a select to move them to a
// different office immediately, without going through the office deletion
// flow.
function MemberRow({
  member,
  offices,
  currentOfficeId,
}: {
  member: { _id: Id<"employees">; name: string; employeeNumber: string }
  offices: { _id: Id<"offices">; name: string }[]
  currentOfficeId: Id<"offices">
}) {
  const reassignMembers = useMutation(api.offices.reassignMembers)
  const [busy, setBusy] = React.useState(false)

  async function move(toOfficeId: string) {
    if (toOfficeId === currentOfficeId) return
    setBusy(true)
    try {
      await reassignMembers({
        employeeIds: [member._id],
        toOfficeId: toOfficeId as Id<"offices">,
      })
      toast.success(`Moved ${member.name}`)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't move employee"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 p-2 pl-3 text-sm">
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{member.name}</span>
        <span className="text-muted-foreground text-xs">
          {member.employeeNumber}
        </span>
      </div>
      <Select value={currentOfficeId} onValueChange={move} disabled={busy}>
        <SelectTrigger className="w-44 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {offices.map((o) => (
            <SelectItem key={o._id} value={o._id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function OfficeDetail({ officeId }: { officeId: Id<"offices"> }) {
  const office = useQuery(api.offices.get, { id: officeId })
  const offices = useQuery(api.offices.list)
  const members = useQuery(api.offices.membersOf, { id: officeId })
  const update = useMutation(api.offices.update)
  const removeOffice = useMutation(api.offices.remove)
  const router = useRouter()

  const [name, setName] = React.useState("")
  const [currency, setCurrency] = React.useState("SGD")
  const [rate, setRate] = React.useState("")
  const [maxDistance, setMaxDistance] = React.useState("")
  const [vehicleRates, setVehicleRates] = React.useState<VehicleRateRow[]>([])
  const [saving, setSaving] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const seeded = React.useRef(false)
  React.useEffect(() => {
    if (!office || seeded.current) return
    seeded.current = true
    setName(office.name)
    setCurrency(office.defaultCurrency ?? "SGD")
    const mileage = office.mileageSettings
    setRate(mileage?.ratePerKmCents != null ? String(mileage.ratePerKmCents / 100) : "")
    setMaxDistance(mileage?.maxDistanceKm != null ? String(mileage.maxDistanceKm) : "")
    setVehicleRates(
      (mileage?.vehicleRates ?? []).map((v) => ({
        id: v.id,
        label: v.label,
        rate: String(v.ratePerKmCents / 100),
      })),
    )
  }, [office])

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
    const mileageSettings = {
      ratePerKmCents: rate !== "" ? Math.round(Number(rate) * 100) : undefined,
      vehicleRates: cleanVehicleRates.length ? cleanVehicleRates : undefined,
      maxDistanceKm: maxDistance !== "" ? Number(maxDistance) : undefined,
    }
    const hasMileageSettings =
      mileageSettings.ratePerKmCents != null ||
      mileageSettings.vehicleRates != null ||
      mileageSettings.maxDistanceKm != null
    setSaving(true)
    try {
      await update({
        id: officeId,
        name: trimmed,
        defaultCurrency: currency,
        mileageSettings: hasMileageSettings ? mileageSettings : undefined,
      })
      toast.success("Office updated")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save office"))
    } finally {
      setSaving(false)
    }
  }

  async function confirmDeleteOffice() {
    try {
      await removeOffice({ id: officeId })
      toast.success("Office deleted")
      router.push("/hr-lounge/org-structure")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't delete office"))
    }
  }

  const filteredMembers = React.useMemo(() => {
    if (!members) return members
    const q = search.trim().toLowerCase()
    if (!q) return members
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.employeeNumber.toLowerCase().includes(q),
    )
  }, [members, search])

  const hasMembers = (members?.length ?? 0) > 0

  if (office === undefined) {
    return (
      <div className="flex flex-col gap-4 px-4 lg:px-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (office === null) {
    return (
      <div className="px-4 lg:px-6">
        <p className="text-muted-foreground text-sm">Office not found.</p>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-5 px-4 lg:px-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/hr-lounge/org-structure"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
        >
          <IconChevronLeft className="size-4" /> Org structure
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            {office.name}
            {office.isDefault && (
              <Badge variant="outline" className="gap-1">
                <IconLock className="size-3" />
                Default
              </Badge>
            )}
          </h2>
          {!office.isDefault && (
            <Button
              variant="outline"
              className="text-destructive"
              disabled={hasMembers}
              title={
                hasMembers
                  ? "Move all members to another office before deleting."
                  : undefined
              }
              onClick={() => setConfirmDelete(true)}
            >
              <IconTrash className="size-4" />
              Delete office
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
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
              <p className="text-muted-foreground text-xs">
                The base currency for claims made by employees assigned here.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mileage claim settings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground -mt-2 text-xs">
            Used to compute reimbursement for mileage-type claims from
            employees assigned to this office.
          </p>
          <div className="grid gap-1.5 sm:max-w-xs">
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
              <div key={row.id} className="flex items-center gap-2 sm:max-w-md">
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
          <div className="grid gap-1.5 sm:max-w-xs">
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
          <div>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="relative max-w-sm">
            <IconSearch className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              placeholder="Search members"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="divide-y rounded-md border">
            {filteredMembers === undefined ? (
              <p className="text-muted-foreground p-3 text-sm">Loading…</p>
            ) : filteredMembers.length === 0 ? (
              <p className="text-muted-foreground p-3 text-sm">
                {hasMembers ? "No members match your search." : "No members assigned."}
              </p>
            ) : (
              filteredMembers.map((m) => (
                <MemberRow
                  key={m._id}
                  member={m}
                  offices={offices ?? []}
                  currentOfficeId={officeId}
                />
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete "${office.name}"?`}
        description="This can't be undone."
        confirmLabel="Delete office"
        destructive
        onConfirm={confirmDeleteOffice}
      />
    </div>
  )
}
