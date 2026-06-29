"use client"

import * as React from "react"
import { useMutation } from "convex/react"
import { toast } from "sonner"
import { IconPlus } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { dollarsToCents, formatMoney } from "@/features/payroll/lib/labels"

type ItemType = "addition" | "deduction" | "overtime"

// ─── Add a single adjustment to one employee ─────────────────────────────────

export function AddAdjustmentDialog({
  runId,
  employeeId,
  employeeName,
  open,
  onOpenChange,
}: {
  runId: Id<"payrollRuns">
  employeeId: Id<"employees">
  employeeName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const addAdjustment = useMutation(api.payroll.addAdjustment)
  const [type, setType] = React.useState<ItemType>("addition")
  const [label, setLabel] = React.useState("")
  const [amount, setAmount] = React.useState("")
  const [cpfable, setCpfable] = React.useState(false)
  const [affectsGross, setAffectsGross] = React.useState(false)
  const [hours, setHours] = React.useState("")
  const [multiplier, setMultiplier] = React.useState("1.5")
  const [busy, setBusy] = React.useState(false)

  function reset() {
    setType("addition")
    setLabel("")
    setAmount("")
    setCpfable(false)
    setAffectsGross(false)
    setHours("")
    setMultiplier("1.5")
  }

  async function submit() {
    setBusy(true)
    try {
      if (type === "overtime") {
        const h = Number(hours)
        if (!Number.isFinite(h) || h <= 0) throw new Error("Enter overtime hours.")
        const m = Number(multiplier)
        await addAdjustment({
          runId,
          employeeId,
          kind: "addition",
          source: "overtime",
          label: `Overtime (rate × ${multiplier})`,
          overtime: { hours: h, multiplier: m },
        })
      } else {
        const cents = dollarsToCents(amount)
        if (cents === null || cents <= 0) throw new Error("Enter a valid amount.")
        if (!label.trim()) throw new Error("Enter a label.")
        await addAdjustment({
          runId,
          employeeId,
          kind: type,
          source: "manual",
          label: label.trim(),
          amountCents: cents,
          cpfable: type === "addition" ? cpfable : undefined,
          affectsGross: type === "deduction" ? affectsGross : undefined,
        })
      }
      toast.success("Item added")
      reset()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add item")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add payroll item</DialogTitle>
          <DialogDescription>{employeeName}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as ItemType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="addition">Addition</SelectItem>
                <SelectItem value="deduction">Deduction</SelectItem>
                <SelectItem value="overtime">Overtime</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {type === "overtime" ? (
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="ot-hours">Hours</Label>
                <Input
                  id="ot-hours"
                  type="number"
                  min="0"
                  step="0.5"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <Label>Multiplier</Label>
                <Select value={multiplier} onValueChange={setMultiplier}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1.5">1.5× (normal OT)</SelectItem>
                    <SelectItem value="2">2× (rest day / holiday)</SelectItem>
                    <SelectItem value="1">1× (flat)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="adj-label">Label</Label>
                <Input
                  id="adj-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder={
                    type === "addition" ? "e.g. Performance bonus" : "e.g. Loan repayment"
                  }
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="adj-amount">Amount</Label>
                <Input
                  id="adj-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              {type === "addition" ? (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={cpfable}
                    onCheckedChange={(c) => setCpfable(c === true)}
                  />
                  Counts toward CPF (Ordinary Wage)
                </label>
              ) : (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={affectsGross}
                    onCheckedChange={(c) => setAffectsGross(c === true)}
                  />
                  Reduce before CPF (e.g. no-pay leave)
                </label>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            <IconPlus className="size-4" />
            Add item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Bulk-add one item type across many employees ────────────────────────────

export function BulkAdjustmentsDialog({
  runId,
  employees,
  currency,
  open,
  onOpenChange,
}: {
  runId: Id<"payrollRuns">
  employees: { employeeId: Id<"employees">; employeeName: string; baseCents: number }[]
  currency: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const addBulk = useMutation(api.payroll.addAdjustmentsBulk)
  const [kind, setKind] = React.useState<"addition" | "deduction">("addition")
  const [label, setLabel] = React.useState("")
  const [cpfable, setCpfable] = React.useState(false)
  const [affectsGross, setAffectsGross] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [amounts, setAmounts] = React.useState<Record<string, string>>({})
  const [busy, setBusy] = React.useState(false)

  const filtered = employees.filter((e) =>
    e.employeeName.toLowerCase().includes(search.toLowerCase()),
  )

  async function submit() {
    setBusy(true)
    try {
      if (!label.trim()) throw new Error("Enter a label.")
      const items = employees
        .map((e) => ({ employeeId: e.employeeId, amountCents: dollarsToCents(amounts[e.employeeId] ?? "") ?? 0 }))
        .filter((i) => i.amountCents > 0)
      if (items.length === 0) throw new Error("Enter an amount for at least one employee.")
      const added = await addBulk({
        runId,
        kind,
        source: "manual",
        label: label.trim(),
        cpfable: kind === "addition" ? cpfable : undefined,
        affectsGross: kind === "deduction" ? affectsGross : undefined,
        items,
      })
      toast.success(`Added to ${added} employee${added === 1 ? "" : "s"}`)
      setAmounts({})
      setLabel("")
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add items")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add items in bulk</DialogTitle>
          <DialogDescription>
            Apply one addition or deduction across multiple employees.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as "addition" | "deduction")}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="addition">Addition</SelectItem>
                  <SelectItem value="deduction">Deduction</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="bulk-label">Label</Label>
              <Input
                id="bulk-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Attendance allowance"
              />
            </div>
          </div>
          {kind === "addition" ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={cpfable}
                onCheckedChange={(c) => setCpfable(c === true)}
              />
              Counts toward CPF (Ordinary Wage)
            </label>
          ) : (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={affectsGross}
                onCheckedChange={(c) => setAffectsGross(c === true)}
              />
              Reduce before CPF (e.g. no-pay leave)
            </label>
          )}

          <Input
            placeholder="Search employees…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="max-h-72 overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Base pay</TableHead>
                  <TableHead className="w-40">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <TableRow key={e.employeeId}>
                    <TableCell className="font-medium">{e.employeeName}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatMoney(e.baseCents, currency)}
                    </TableCell>
                    <TableCell>
                      <Input
                        inputMode="decimal"
                        placeholder="0.00"
                        value={amounts[e.employeeId] ?? ""}
                        onChange={(ev) =>
                          setAmounts((prev) => ({
                            ...prev,
                            [e.employeeId]: ev.target.value,
                          }))
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            Add items
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
