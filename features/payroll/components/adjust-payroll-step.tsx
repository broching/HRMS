"use client"

import * as React from "react"
import { useMutation, useAction } from "convex/react"
import { toast } from "sonner"
import type { FunctionReturnType } from "convex/server"
import {
  IconChevronDown,
  IconChevronRight,
  IconPlus,
  IconTrash,
  IconCalendarMinus,
  IconReceipt,
  IconClock,
  IconUserPlus,
  IconUserMinus,
  IconRefresh,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { cn } from "@/lib/utils"
import {
  formatMoney,
  prYearLabel,
  CPF_STATUS_LABELS,
} from "@/features/payroll/lib/labels"
import { getErrorMessage } from "@/lib/errors"
import {
  AddAdjustmentDialog,
  BulkAdjustmentsDialog,
} from "@/features/payroll/components/adjustment-dialogs"
import {
  AddEmployeeDialog,
  ClaimsPickerDialog,
} from "@/features/payroll/components/roster-dialogs"

type Workspace = NonNullable<FunctionReturnType<typeof api.payroll.getRunWorkspace>>
type PayslipRow = Workspace["payslips"][number]
type Adjustment = PayslipRow["adjustments"][number]

function initials(name: string) {
  const [a, b] = name.split(" ")
  return `${a?.[0] ?? ""}${b?.[0] ?? ""}`.toUpperCase()
}

function ValidateBanner({
  available,
  onOpenClaims,
  onPullOvertime,
}: {
  available: Workspace["available"]
  onOpenClaims: () => void
  onPullOvertime: () => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border bg-muted/40 p-4">
      <div className="text-sm font-medium">
        Validate payroll items
        <p className="text-muted-foreground text-xs font-normal">
          Review items before you continue.
        </p>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <IconCalendarMinus className="text-muted-foreground size-4" />
        No-pay leave
        {available.unpaidLeaveDays > 0 && (
          <Badge variant="secondary">{available.unpaidLeaveDays}d</Badge>
        )}
        <span className="text-muted-foreground text-xs">
          auto-prorated from base pay
        </span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <IconReceipt className="text-muted-foreground size-4" />
        Claims
        {available.claims > 0 && <Badge variant="secondary">{available.claims}</Badge>}
        <Button size="sm" variant="outline" onClick={onOpenClaims}>
          Select claims
        </Button>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <IconClock className="text-muted-foreground size-4" />
        Overtime
        {available.overtime > 0 && (
          <Badge variant="secondary">{available.overtime}</Badge>
        )}
        {available.overtime > 0 && (
          <Button size="sm" variant="outline" onClick={onPullOvertime}>
            Pull overtime
          </Button>
        )}
      </div>
    </div>
  )
}

function AdjustmentLines({
  title,
  totalCents,
  currency,
  items,
  tone,
  onRemove,
}: {
  title: string
  totalCents: number
  currency: string
  items: Adjustment[]
  tone: "earning" | "deduction" | "employer"
  onRemove: (id: Id<"payrollAdjustments">) => void
}) {
  if (items.length === 0) return null
  return (
    <div className="text-sm">
      <div
        className={`flex items-center justify-between px-2 py-1.5 font-medium ${
          tone === "earning"
            ? "bg-emerald-50 dark:bg-emerald-950/30"
            : tone === "employer"
              ? "bg-indigo-50 dark:bg-indigo-950/30"
              : "bg-rose-50 dark:bg-rose-950/30"
        }`}
      >
        <span>{title}</span>
        <span className="tabular-nums">{formatMoney(totalCents, currency)}</span>
      </div>
      {items.map((a) => (
        <div
          key={a._id}
          className="flex items-center justify-between gap-2 px-2 py-1.5"
        >
          <span className="flex items-center gap-2">
            {a.label}
            {a.source !== "manual" && (
              <Badge variant="outline" className="text-[10px]">
                {a.source === "claim"
                  ? "claim"
                  : a.source === "unpaid_leave"
                    ? "no-pay"
                    : "OT"}
              </Badge>
            )}
            {a.kind === "addition" && a.cpfable && (
              <span className="text-muted-foreground text-[10px]">CPF</span>
            )}
          </span>
          <span className="flex items-center gap-2">
            <span className="tabular-nums">
              {formatMoney(a.amountCents, currency)}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={() => onRemove(a._id)}
            >
              <IconTrash className="size-3.5" />
            </Button>
          </span>
        </div>
      ))}
    </div>
  )
}

// Statutory funds & schemes (SHG e.g. CDAC, SDL, custom funds) computed onto the
// payslip lines — surfaced read-only so HR can see them while adjusting.
function FundLines({
  lines,
  currency,
}: {
  lines: PayslipRow["lines"]
  currency: string
}) {
  const funds = lines.filter((l) => l.category === "fund")
  if (funds.length === 0) return null
  return (
    <div className="overflow-hidden rounded-md border bg-background text-sm">
      <div className="text-muted-foreground bg-muted/40 px-2 py-1.5 text-xs font-medium uppercase">
        Statutory funds &amp; schemes
      </div>
      {funds.map((l, i) => (
        <div key={i} className="flex items-center justify-between px-2 py-1.5">
          <span className="flex items-center gap-2">
            {l.label}
            <Badge variant="outline" className="text-[10px]">
              {l.type === "employer" ? "employer" : "employee"}
            </Badge>
          </span>
          <span className="tabular-nums">
            {l.type === "deduction" ? "−" : ""}
            {formatMoney(l.amountCents, currency)}
          </span>
        </div>
      ))}
    </div>
  )
}

// Editable proration panel: shows base × daysWorked / totalWorkingDays and lets
// HR correct the day counts when the auto-computed proration is wrong.
function ProrationEditor({
  runId,
  p,
}: {
  runId: Id<"payrollRuns">
  p: PayslipRow
}) {
  const setOverride = useMutation(api.payroll.setProrationOverride)
  const clearOverride = useMutation(api.payroll.clearProrationOverride)
  const [editing, setEditing] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const pr = p.proration
  const autoTotal = pr?.totalWorkingDays ?? 0
  const autoWorked = pr?.daysWorked ?? autoTotal
  const [worked, setWorked] = React.useState(String(autoWorked))
  const [total, setTotal] = React.useState(String(autoTotal))

  // Re-seed inputs when the underlying figures change (e.g. after refresh).
  React.useEffect(() => {
    setWorked(String(autoWorked))
    setTotal(String(autoTotal))
  }, [autoWorked, autoTotal])

  const workedN = Number(worked)
  const totalN = Number(total)
  const valid =
    Number.isFinite(workedN) &&
    Number.isFinite(totalN) &&
    totalN > 0 &&
    workedN >= 0 &&
    workedN <= totalN
  const preview =
    valid && totalN > 0
      ? Math.round((p.fullBaseCents * workedN) / totalN)
      : p.baseCents

  async function apply() {
    if (!valid) {
      toast.error("Days worked must be between 0 and total working days.")
      return
    }
    setBusy(true)
    try {
      await setOverride({
        runId,
        employeeId: p.employeeId,
        daysWorked: workedN,
        totalWorkingDays: totalN,
      })
      toast.success("Proration updated")
      setEditing(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't update proration"))
    } finally {
      setBusy(false)
    }
  }

  async function reset() {
    setBusy(true)
    try {
      await clearOverride({ runId, employeeId: p.employeeId })
      toast.success("Proration reset to auto-computed")
      setEditing(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't reset proration"))
    } finally {
      setBusy(false)
    }
  }

  const isProrated = pr?.prorated ?? false
  const overridden = pr?.overridden ?? false

  return (
    <div className="rounded-md border bg-background text-sm">
      <div className="flex items-center justify-between px-2 py-1.5">
        <span className="flex items-center gap-2">
          <span className="text-muted-foreground">Basic salary</span>
          {isProrated && (
            <Badge variant="secondary" className="text-[10px]">
              prorated
            </Badge>
          )}
          {overridden && (
            <Badge variant="outline" className="text-[10px]">
              edited
            </Badge>
          )}
        </span>
        <span className="flex items-center gap-2">
          <span className="tabular-nums">
            {formatMoney(p.baseCents, p.currency)}
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={(e) => {
              e.stopPropagation()
              setEditing((v) => !v)
            }}
          >
            {editing ? "Close" : "Edit proration"}
          </Button>
        </span>
      </div>

      {(isProrated || overridden) && !editing && (
        <div className="text-muted-foreground border-t px-2 py-1.5 text-xs">
          {formatMoney(p.fullBaseCents, p.currency)} × {autoWorked}/{autoTotal}{" "}
          working days
          {pr && pr.unpaidLeaveDays > 0 && !overridden
            ? ` · ${pr.unpaidLeaveDays}d unpaid`
            : ""}
        </div>
      )}

      {editing && (
        <div
          className="flex flex-col gap-3 border-t p-3"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Days worked</Label>
              <Input
                inputMode="numeric"
                value={worked}
                onChange={(e) => setWorked(e.target.value)}
                className="h-8"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Total working days</Label>
              <Input
                inputMode="numeric"
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                className="h-8"
              />
            </div>
          </div>
          <div className="text-muted-foreground text-xs">
            = <span className="text-foreground tabular-nums">
              {formatMoney(preview, p.currency)}
            </span>{" "}
            ({formatMoney(p.fullBaseCents, p.currency)} × {worked || 0}/
            {total || 0})
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={apply} disabled={busy || !valid}>
              Apply
            </Button>
            {overridden && (
              <Button
                size="sm"
                variant="outline"
                onClick={reset}
                disabled={busy}
              >
                Reset to auto
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Hours editor for an hourly-paid employee: enter hours worked this period and
// preview base = hourly rate × hours. Replaces the proration editor for hourly
// pay (which isn't prorated by month days).
function HoursEditor({
  runId,
  p,
}: {
  runId: Id<"payrollRuns">
  p: PayslipRow
}) {
  const setHours = useMutation(api.payroll.setPayslipHours)
  const [busy, setBusy] = React.useState(false)
  const [hours, setHoursInput] = React.useState(
    p.hoursWorked != null ? String(p.hoursWorked) : "",
  )

  React.useEffect(() => {
    setHoursInput(p.hoursWorked != null ? String(p.hoursWorked) : "")
  }, [p.hoursWorked])

  const rate = p.hourlyRateCents ?? 0
  const hoursN = Number(hours)
  const valid = Number.isFinite(hoursN) && hoursN >= 0
  const preview = valid ? Math.round(rate * hoursN) : p.baseCents

  async function apply() {
    if (!valid) {
      toast.error("Enter a valid number of hours.")
      return
    }
    setBusy(true)
    try {
      await setHours({ runId, employeeId: p.employeeId, hours: hoursN })
      toast.success("Hours updated")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't update hours"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="rounded-md border bg-background text-sm"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-2 py-1.5">
        <span className="flex items-center gap-2">
          <span className="text-muted-foreground">Hourly pay</span>
          <Badge variant="secondary" className="text-[10px]">
            {formatMoney(rate, p.currency)}/hr
          </Badge>
          {p.hoursWorked == null && (
            <Badge variant="outline" className="text-[10px]">
              hours not set
            </Badge>
          )}
        </span>
        <span className="tabular-nums">
          {formatMoney(p.baseCents, p.currency)}
        </span>
      </div>
      <div className="flex flex-col gap-3 border-t p-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Hours worked</Label>
            <Input
              inputMode="decimal"
              value={hours}
              onChange={(e) => setHoursInput(e.target.value)}
              placeholder="0"
              className="h-8"
            />
          </div>
        </div>
        <div className="text-muted-foreground text-xs">
          ={" "}
          <span className="text-foreground tabular-nums">
            {formatMoney(preview, p.currency)}
          </span>{" "}
          ({formatMoney(rate, p.currency)}/hr × {hours || 0} hr)
        </div>
        <div>
          <Button size="sm" onClick={apply} disabled={busy || !valid}>
            Apply hours
          </Button>
        </div>
      </div>
    </div>
  )
}

// Exchange-rate editor for a foreign-currency payslip: fetch a live rate or
// enter one manually, apply it (with its date) to the run, and preview the
// base-currency net. Only rendered when the pay currency ≠ base currency.
function ExchangeEditor({
  runId,
  p,
}: {
  runId: Id<"payrollRuns">
  p: PayslipRow
}) {
  const getRate = useAction(api.exchange.getRate)
  const setRate = useMutation(api.payroll.setPayslipExchangeRate)
  const base = p.baseCurrency ?? ""
  const [mode, setMode] = React.useState<"auto" | "manual">(
    p.exchangeMode ?? "auto",
  )
  const [manual, setManual] = React.useState(
    p.exchangeRate != null && p.exchangeMode === "manual"
      ? String(p.exchangeRate)
      : "",
  )
  const [fetching, setFetching] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const today = () => new Date().toISOString().slice(0, 10)

  async function applyAuto() {
    setFetching(true)
    try {
      const res = await getRate({ from: p.currency, to: base, date: today() })
      await setRate({
        runId,
        employeeId: p.employeeId,
        rate: res.rate,
        date: res.date,
        mode: "auto",
        provider: res.provider,
      })
      toast.success(`Rate updated · 1 ${p.currency} = ${res.rate} ${base}`)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't fetch rate"))
    } finally {
      setFetching(false)
    }
  }

  async function applyManual() {
    const rate = Number(manual)
    if (!(rate > 0)) {
      toast.error("Enter a valid exchange rate.")
      return
    }
    setBusy(true)
    try {
      await setRate({
        runId,
        employeeId: p.employeeId,
        rate,
        date: today(),
        mode: "manual",
        provider: "manual",
      })
      toast.success("Exchange rate updated")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't set rate"))
    } finally {
      setBusy(false)
    }
  }

  const baseNet =
    p.exchangeRate != null ? Math.round(p.netCents * p.exchangeRate) : null

  return (
    <div
      className="border-primary/30 bg-background rounded-md border p-3 text-sm"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-medium">
          Currency conversion
          <Badge variant="secondary" className="text-[10px]">
            {p.currency} → {base}
          </Badge>
        </span>
        {p.exchangeRate != null ? (
          <span className="text-muted-foreground text-xs">
            1 {p.currency} = {p.exchangeRate} {base}
            {p.exchangeProvider ? ` · ${p.exchangeProvider}` : ""}
            {p.exchangeRateDate ? ` · ${p.exchangeRateDate}` : ""}
          </span>
        ) : (
          <Badge variant="destructive" className="text-[10px]">
            rate not set
          </Badge>
        )}
      </div>

      <div className="mt-2 flex gap-1 rounded-md border p-0.5">
        {(["auto", "manual"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "flex-1 rounded px-2 py-1 text-xs font-medium capitalize",
              mode === m ? "bg-muted shadow-sm" : "text-muted-foreground",
            )}
          >
            {m === "auto" ? "Auto (live rate)" : "Manual rate"}
          </button>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-2">
        {mode === "auto" ? (
          <Button size="sm" variant="outline" onClick={applyAuto} disabled={fetching}>
            {fetching ? "Fetching…" : "Fetch & apply today's rate"}
          </Button>
        ) : (
          <>
            <Input
              inputMode="decimal"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder={`1 ${p.currency} = ? ${base}`}
              className="h-8 max-w-[180px]"
            />
            <Button size="sm" onClick={applyManual} disabled={busy}>
              Apply
            </Button>
          </>
        )}
      </div>

      {baseNet != null && (
        <p className="text-muted-foreground mt-2 text-xs">
          Net {formatMoney(p.netCents, p.currency)} ≈{" "}
          <span className="text-foreground">{formatMoney(baseNet, base)}</span>
        </p>
      )}
    </div>
  )
}

function EmployeeRow({
  runId,
  p,
  showEmployer,
  expanded,
  onToggle,
}: {
  runId: Id<"payrollRuns">
  p: PayslipRow
  showEmployer: boolean
  expanded: boolean
  onToggle: () => void
}) {
  const removeAdjustment = useMutation(api.payroll.removeAdjustment)
  const removeEmployee = useMutation(api.payroll.removeEmployeeFromRun)
  const [addOpen, setAddOpen] = React.useState(false)
  const [excludeOpen, setExcludeOpen] = React.useState(false)

  const additions = p.adjustments.filter((a) => a.kind === "addition")
  const deductions = p.adjustments.filter((a) => a.kind === "deduction")
  const employerItems = p.adjustments.filter((a) => a.kind === "employer")
  const additionsTotal = additions.reduce((s, a) => s + a.amountCents, 0)
  const deductionsTotal = deductions.reduce((s, a) => s + a.amountCents, 0)
  const employerTotal = employerItems.reduce((s, a) => s + a.amountCents, 0)

  async function remove(id: Id<"payrollAdjustments">) {
    try {
      await removeAdjustment({ adjustmentId: id })
      toast.success("Item removed")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't remove item"))
    }
  }

  async function exclude() {
    try {
      await removeEmployee({ runId, employeeId: p.employeeId })
      toast.success(`${p.employeeName} excluded from the run`)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't exclude employee"))
    }
  }

  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell>
          <div className="flex items-center gap-2">
            {expanded ? (
              <IconChevronDown className="size-4" />
            ) : (
              <IconChevronRight className="size-4" />
            )}
            <Avatar className="size-8">
              <AvatarImage src={p.employeePhotoUrl ?? undefined} />
              <AvatarFallback className="text-xs">
                {initials(p.employeeName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="font-medium">{p.employeeName}</span>
              {p.positionTitle && (
                <span className="text-muted-foreground text-xs">
                  {p.positionTitle}
                </span>
              )}
            </div>
          </div>
        </TableCell>
        <TableCell className="tabular-nums">
          {formatMoney(p.baseCents, p.currency)}
        </TableCell>
        <TableCell className="tabular-nums">
          {formatMoney(p.grossCents, p.currency)}
        </TableCell>
        <TableCell className="tabular-nums">
          {formatMoney(p.employeeCpfCents, p.currency)}
        </TableCell>
        {showEmployer && (
          <TableCell className="tabular-nums">
            {formatMoney(p.employerCpfCents, p.currency)}
          </TableCell>
        )}
        <TableCell className="tabular-nums font-medium">
          {formatMoney(p.netCents, p.currency)}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={showEmployer ? 6 : 5} className="bg-muted/30 p-0">
            <div className="flex flex-col gap-3 p-4">
              {p.baseCurrency && p.currency !== p.baseCurrency && (
                <ExchangeEditor runId={runId} p={p} />
              )}

              {p.payType === "hourly" ? (
                <HoursEditor runId={runId} p={p} />
              ) : (
                <ProrationEditor runId={runId} p={p} />
              )}

              {p.allowances.length > 0 && (
                <div className="text-sm">
                  <div className="text-muted-foreground px-2 py-1 text-xs font-medium uppercase">
                    Recurring allowances
                  </div>
                  {p.allowances.map((al, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between px-2 py-1"
                    >
                      <span>
                        {al.name}
                        {al.cpfable && (
                          <span className="text-muted-foreground ml-2 text-[10px]">
                            CPF
                          </span>
                        )}
                      </span>
                      <span className="tabular-nums">
                        {formatMoney(al.amountCents, p.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="overflow-hidden rounded-md border bg-background">
                <AdjustmentLines
                  title="Additions"
                  totalCents={additionsTotal}
                  currency={p.currency}
                  items={additions}
                  tone="earning"
                  onRemove={remove}
                />
                <AdjustmentLines
                  title="Deductions"
                  totalCents={deductionsTotal + p.employeeCpfCents}
                  currency={p.currency}
                  items={deductions}
                  tone="deduction"
                  onRemove={remove}
                />
                <div className="flex items-center justify-between px-2 py-1.5 text-sm">
                  <span className="flex items-center gap-2">
                    CPF (employee)
                    <Badge variant="outline" className="text-[10px]">
                      {CPF_STATUS_LABELS[p.cpfStatus]}
                      {p.cpfStatus === "pr" && p.prYear
                        ? ` · ${prYearLabel(p.prYear)}`
                        : ""}
                    </Badge>
                  </span>
                  <span className="tabular-nums">
                    {formatMoney(p.employeeCpfCents, p.currency)}
                  </span>
                </div>
                <AdjustmentLines
                  title="Employer contributions"
                  totalCents={employerTotal}
                  currency={p.currency}
                  items={employerItems}
                  tone="employer"
                  onRemove={remove}
                />
              </div>

              <FundLines lines={p.lines} currency={p.currency} />

              <div className="flex items-center justify-between gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation()
                    setAddOpen(true)
                  }}
                >
                  <IconPlus className="size-4" />
                  Add item
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    setExcludeOpen(true)
                  }}
                >
                  <IconUserMinus className="size-4" />
                  Exclude from run
                </Button>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
      <AddAdjustmentDialog
        runId={runId}
        employeeId={p.employeeId}
        employeeName={p.employeeName}
        open={addOpen}
        onOpenChange={setAddOpen}
      />
      <ConfirmDialog
        open={excludeOpen}
        onOpenChange={setExcludeOpen}
        title={`Exclude ${p.employeeName}?`}
        description="Their payslip and any pulled claims or leave for this run will be removed. You can add them back later."
        confirmLabel="Exclude"
        destructive
        onConfirm={exclude}
      />
    </>
  )
}

export function AdjustPayrollStep({ workspace }: { workspace: Workspace }) {
  const refreshRun = useMutation(api.payroll.refreshRun)
  const pullOvertime = useMutation(api.payroll.pullOvertime)
  const [search, setSearch] = React.useState("")
  const [showEmployer, setShowEmployer] = React.useState(false)
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())
  const [bulkOpen, setBulkOpen] = React.useState(false)
  const [addEmpOpen, setAddEmpOpen] = React.useState(false)
  const [claimsOpen, setClaimsOpen] = React.useState(false)

  const { run, payslips, available } = workspace
  const filtered = payslips.filter((p) =>
    p.employeeName.toLowerCase().includes(search.toLowerCase()),
  )

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <ValidateBanner
        available={available}
        onOpenClaims={() => setClaimsOpen(true)}
        onPullOvertime={async () => {
          try {
            const n = await pullOvertime({ runId: run._id })
            toast.success(
              n > 0
                ? `Pulled ${n} overtime item${n === 1 ? "" : "s"}`
                : "No approved overtime to pull",
            )
          } catch (e) {
            toast.error(getErrorMessage(e, "Couldn't pull overtime"))
          }
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex items-center gap-4">
          <Label className="flex items-center gap-2 text-sm font-normal">
            <Switch checked={showEmployer} onCheckedChange={setShowEmployer} />
            Employer contributions
          </Label>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await refreshRun({ runId: run._id })
                toast.success("Payslips recomputed from current compensation")
              } catch (e) {
                toast.error(getErrorMessage(e, "Couldn't refresh"))
              }
            }}
          >
            <IconRefresh className="size-4" />
            Refresh
          </Button>
          <Button variant="outline" onClick={() => setAddEmpOpen(true)}>
            <IconUserPlus className="size-4" />
            Add employee
          </Button>
          <Button variant="outline" onClick={() => setBulkOpen(true)}>
            <IconPlus className="size-4" />
            Add items in bulk
          </Button>
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Basic pay</TableHead>
              <TableHead>Gross pay</TableHead>
              <TableHead>CPF (emp.)</TableHead>
              {showEmployer && <TableHead>Employer CPF</TableHead>}
              <TableHead>Net pay</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={showEmployer ? 6 : 5}
                  className="text-muted-foreground py-8 text-center"
                >
                  No employees in this run.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <EmployeeRow
                  key={p._id}
                  runId={run._id}
                  p={p}
                  showEmployer={showEmployer}
                  expanded={expanded.has(p.employeeId)}
                  onToggle={() => toggle(p.employeeId)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <BulkAdjustmentsDialog
        runId={run._id}
        currency={run.currency}
        employees={payslips.map((p) => ({
          employeeId: p.employeeId,
          employeeName: p.employeeName,
          baseCents: p.baseCents,
        }))}
        open={bulkOpen}
        onOpenChange={setBulkOpen}
      />

      <AddEmployeeDialog
        runId={run._id}
        open={addEmpOpen}
        onOpenChange={setAddEmpOpen}
      />

      <ClaimsPickerDialog
        runId={run._id}
        open={claimsOpen}
        onOpenChange={setClaimsOpen}
      />
    </div>
  )
}
