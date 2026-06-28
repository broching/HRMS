"use client"

import * as React from "react"
import { useMutation } from "convex/react"
import { toast } from "sonner"
import { IconPlus, IconX } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { CpfStatus } from "@/convex/lib/enums"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CPF_STATUS_LABELS, dollarsToCents } from "@/features/payroll/lib/labels"

type AllowanceRow = { name: string; amount: string; cpfable: boolean }

export function SetCompensationDialog({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  defaultCpfStatus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  employeeId: Id<"employees">
  employeeName: string
  defaultCpfStatus?: CpfStatus | null
}) {
  const setCompensation = useMutation(api.compensation.setCompensation)

  const [effectiveDate, setEffectiveDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10),
  )
  const [base, setBase] = React.useState("")
  const [cpf, setCpf] = React.useState<CpfStatus>(
    defaultCpfStatus ?? "citizen_pr",
  )
  const [allowances, setAllowances] = React.useState<AllowanceRow[]>([])
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (open) setCpf(defaultCpfStatus ?? "citizen_pr")
  }, [open, defaultCpfStatus])

  function addAllowance() {
    setAllowances((a) => [...a, { name: "", amount: "", cpfable: false }])
  }
  function updateAllowance(i: number, patch: Partial<AllowanceRow>) {
    setAllowances((a) => a.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))
  }
  function removeAllowance(i: number) {
    setAllowances((a) => a.filter((_, idx) => idx !== i))
  }

  async function submit() {
    const baseCents = dollarsToCents(base)
    if (baseCents === null) {
      toast.error("Enter a valid base salary.")
      return
    }
    const mapped: { name: string; amountCents: number; cpfable: boolean }[] = []
    for (const a of allowances) {
      if (!a.name.trim()) continue
      const cents = dollarsToCents(a.amount)
      if (cents === null) {
        toast.error(`Invalid amount for "${a.name}".`)
        return
      }
      mapped.push({ name: a.name.trim(), amountCents: cents, cpfable: a.cpfable })
    }
    setBusy(true)
    try {
      await setCompensation({
        employeeId,
        effectiveDate,
        baseMonthlyCents: baseCents,
        allowances: mapped,
        cpfStatus: cpf,
        note: note || undefined,
      })
      toast.success("Compensation saved")
      onOpenChange(false)
      setBase("")
      setAllowances([])
      setNote("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Set compensation</DialogTitle>
          <DialogDescription>
            {employeeName} · creates a new effective-dated salary record.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-eff">Effective date</Label>
              <Input
                id="c-eff"
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-base">Base monthly</Label>
              <Input
                id="c-base"
                inputMode="decimal"
                value={base}
                onChange={(e) => setBase(e.target.value)}
                placeholder="5000.00"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>CPF status</Label>
            <Select value={cpf} onValueChange={(v) => setCpf(v as CpfStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CPF_STATUS_LABELS) as CpfStatus[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {CPF_STATUS_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Allowances</Label>
              <Button variant="outline" size="sm" onClick={addAllowance}>
                <IconPlus className="size-4" />
                Add
              </Button>
            </div>
            {allowances.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={a.name}
                  onChange={(e) => updateAllowance(i, { name: e.target.value })}
                  placeholder="Transport"
                  className="flex-1"
                />
                <Input
                  value={a.amount}
                  onChange={(e) => updateAllowance(i, { amount: e.target.value })}
                  placeholder="200.00"
                  inputMode="decimal"
                  className="w-28"
                />
                <label className="flex items-center gap-1 text-xs">
                  <Switch
                    checked={a.cpfable}
                    onCheckedChange={(cpfable) => updateAllowance(i, { cpfable })}
                  />
                  CPF
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeAllowance(i)}
                  aria-label="Remove allowance"
                >
                  <IconX className="size-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="c-note">Note</Label>
            <Input
              id="c-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Annual increment"
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            Save compensation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
