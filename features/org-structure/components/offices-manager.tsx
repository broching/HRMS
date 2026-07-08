"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery, useMutation } from "convex/react"
import { IconPlus, IconLock, IconChevronRight } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
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

// Quick-create dialog — just enough to get an office on the board. Everything
// else (mileage settings, members) is configured on the office's dedicated
// page, which this opens straight into after creation.
function AddOfficeDialog() {
  const create = useMutation(api.offices.create)
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [currency, setCurrency] = React.useState("SGD")
  const [busy, setBusy] = React.useState(false)

  function reset() {
    setName("")
    setCurrency("SGD")
  }

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error("Office name is required.")
      return
    }
    setBusy(true)
    try {
      const id = await create({
        name: trimmed,
        timezone: "Asia/Singapore",
        defaultCurrency: currency,
      })
      toast.success("Office added")
      setOpen(false)
      reset()
      router.push(`/hr-lounge/org-structure/offices/${id}`)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save office"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!busy) {
          setOpen(o)
          if (!o) reset()
        }
      }}
    >
      <Button size="sm" onClick={() => setOpen(true)}>
        <IconPlus className="size-4" />
        Add
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add office</DialogTitle>
          <DialogDescription>
            Mileage settings and members are configured on the office&apos;s
            own page after it&apos;s created.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Name</Label>
            <Input
              value={name}
              placeholder="e.g. Kuala Lumpur"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  save()
                }
              }}
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
          <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Adding…" : "Add office"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function OfficesManager() {
  const offices = useQuery(api.offices.list)
  const ensureDefault = useMutation(api.offices.ensureDefault)

  // Backfill the protected default office for orgs created before it existed.
  React.useEffect(() => {
    if (offices !== undefined && !offices.some((o) => o.isDefault)) {
      ensureDefault({}).catch(() => {})
    }
  }, [offices, ensureDefault])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Offices</CardTitle>
        <AddOfficeDialog />
      </CardHeader>
      <CardContent>
        <div className="divide-y rounded-md border">
          {offices === undefined ? (
            <p className="text-muted-foreground p-3 text-sm">Loading…</p>
          ) : offices.length === 0 ? (
            <p className="text-muted-foreground p-3 text-sm">None yet.</p>
          ) : (
            offices.map((o) => (
              <Link
                key={o._id}
                href={`/hr-lounge/org-structure/offices/${o._id}`}
                className="hover:bg-muted/50 flex items-center justify-between gap-2 p-2 pl-3 text-sm"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{o.name}</span>
                  <Badge variant="secondary">{o.defaultCurrency ?? "SGD"}</Badge>
                  {o.isDefault && (
                    <Badge variant="outline" className="gap-1">
                      <IconLock className="size-3" />
                      Default
                    </Badge>
                  )}
                </div>
                <IconChevronRight className="text-muted-foreground size-4 shrink-0" />
              </Link>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
