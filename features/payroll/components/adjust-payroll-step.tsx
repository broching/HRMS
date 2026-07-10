"use client"

import * as React from "react"
import { useMutation } from "convex/react"
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
import { formatMoney } from "@/features/payroll/lib/labels"
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
}: {
  available: Workspace["available"]
  onOpenClaims: () => void
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
        {available.overtime > 0 && <Badge variant="secondary">{available.overtime}</Badge>}
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
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Basic salary
                  {p.proration?.prorated && (
                    <span className="ml-2 text-xs">
                      prorated · {p.proration.daysWorked}/
                      {p.proration.totalWorkingDays} days
                      {p.proration.unpaidLeaveDays > 0
                        ? ` · ${p.proration.unpaidLeaveDays}d unpaid`
                        : ""}
                    </span>
                  )}
                </span>
                <span className="tabular-nums">
                  {formatMoney(p.baseCents, p.currency)}
                </span>
              </div>

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
                  <span>CPF (employee)</span>
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
