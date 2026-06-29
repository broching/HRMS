"use client"

import type { FunctionReturnType } from "convex/server"
import { api } from "@/convex/_generated/api"
import { cn } from "@/lib/utils"
import {
  CPF_STATUS_LABELS,
  formatDocDate,
  formatMoney,
} from "@/features/payroll/lib/labels"

type Payslip = FunctionReturnType<typeof api.payroll.getPayslip>

const TYPE_LABEL = {
  earning: "Earnings",
  deduction: "Deductions",
  employer: "Employer contributions",
} as const

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-muted-foreground font-medium">{label}:</span>
      <span>{value}</span>
    </div>
  )
}

/**
 * The printable payslip body (Image #18). Rendered inside a `.payslip-print`
 * container so the print stylesheet can isolate it. Shared by the /payslips
 * viewer and the /payslips/[id] detail page.
 */
export function PayslipDocument({ slip }: { slip: Payslip }) {
  const groups = ["earning", "deduction", "employer"] as const
  const paymentPeriod = `${formatDocDate(slip.payPeriodStart)} – ${formatDocDate(slip.payPeriodEnd)}`

  return (
    <div className="payslip-print bg-card flex flex-col gap-8 rounded-lg border p-6 lg:p-8">
      {/* Header: company + payment context */}
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="text-primary text-lg font-bold tracking-tight">
            {slip.companyName}
          </span>
        </div>
        <div className="flex flex-col gap-1 sm:items-end sm:text-right">
          <InfoRow label="Payment Period" value={paymentPeriod} />
          <InfoRow
            label="Date of Payment"
            value={slip.payDate ? formatDocDate(slip.payDate) : "Pending"}
          />
        </div>
      </div>

      {/* Employee details */}
      <div className="grid gap-2 border-t pt-6 sm:grid-cols-2">
        <InfoRow label="Name" value={slip.employeeName} />
        <InfoRow label="Employee ID" value={slip.employeeNumber} />
        <InfoRow label="Department" value={slip.departmentName ?? "—"} />
        <InfoRow label="Occupation" value={slip.positionTitle ?? "—"} />
        <InfoRow label="CPF status" value={CPF_STATUS_LABELS[slip.cpfStatus]} />
      </div>

      {/* Earnings / deductions / employer */}
      <div className="flex flex-col gap-5">
        {groups.map((g) => {
          const lines = slip.lines.filter((l) => l.type === g)
          if (lines.length === 0) return null
          const subtotal = lines.reduce((s, l) => s + l.amountCents, 0)
          return (
            <div key={g} className="flex flex-col gap-1.5">
              <div className="text-primary flex items-center justify-between border-b pb-1.5 text-xs font-semibold uppercase tracking-wide">
                <span>{TYPE_LABEL[g]}</span>
                <span>Amount</span>
              </div>
              {lines.map((l, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm"
                >
                  <span>{l.label}</span>
                  <span
                    className={cn(
                      "tabular-nums",
                      l.type === "deduction" && "text-destructive",
                    )}
                  >
                    {l.type === "deduction" ? "−" : ""}
                    {formatMoney(l.amountCents, slip.currency)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t pt-1.5 text-sm font-medium">
                <span>Total</span>
                <span className="tabular-nums">
                  {formatMoney(subtotal, slip.currency)}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Totals */}
      <div className="flex flex-col gap-2 border-t pt-4">
        <div className="flex items-center justify-between">
          <span className="font-medium">Gross pay</span>
          <span className="tabular-nums">
            {formatMoney(slip.grossCents, slip.currency)}
          </span>
        </div>
        <div className="flex items-center justify-between text-lg font-semibold">
          <span>Net pay</span>
          <span className="tabular-nums">
            {formatMoney(slip.netCents, slip.currency)}
          </span>
        </div>
        <p className="text-muted-foreground text-xs">
          CPF-eligible wage: {formatMoney(slip.cpfableWageCents, slip.currency)}.
          Employer CPF of {formatMoney(slip.employerCpfCents, slip.currency)} is
          paid on top and not deducted from your pay.
        </p>
      </div>
    </div>
  )
}
