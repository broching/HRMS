"use client"

import { getErrorMessage } from "@/lib/errors"
import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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

export function InitialBalancesDialog({
  open,
  onOpenChange,
  leaveTypeId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  leaveTypeId: Id<"leaveTypes">
}) {
  const directory = useQuery(api.employees.directoryOptions, {}) ?? []
  const setBalances = useMutation(api.leaveBalances.initialBalances)

  const [employeeId, setEmployeeId] = React.useState("")
  const [year, setYear] = React.useState(new Date().getUTCFullYear())
  const [carried, setCarried] = React.useState("")
  const [adjustment, setAdjustment] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const years = Array.from(
    { length: 5 },
    (_, i) => new Date().getUTCFullYear() - 2 + i,
  )

  async function handleSave() {
    if (!employeeId) return toast.error("Select an employee")
    setBusy(true)
    try {
      await setBalances({
        employeeId: employeeId as Id<"employees">,
        leaveTypeId,
        year,
        carriedForwardDays: carried === "" ? undefined : Number(carried),
        adjustmentDays: adjustment === "" ? undefined : Number(adjustment),
      })
      toast.success("Initial balances saved")
      onOpenChange(false)
      setCarried("")
      setAdjustment("")
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not save"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Initial balances</DialogTitle>
          <DialogDescription>
            Manually set carried-forward and adjustment days for an employee.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Employee</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select employee" />
              </SelectTrigger>
              <SelectContent>
                {directory.map((e) => (
                  <SelectItem key={e._id} value={e._id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Year</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Carried-forward days</Label>
              <Input
                type="number"
                step="0.5"
                placeholder="0"
                value={carried}
                onChange={(e) => setCarried(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Adjustment days</Label>
              <Input
                type="number"
                step="0.5"
                placeholder="0"
                value={adjustment}
                onChange={(e) => setAdjustment(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
