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
 * The printable payslip body, driven by the run's payslip template (accent
 * colour, font, logo, header/footer, and which sections render). Rendered inside
 * a `.payslip-print` container so the print stylesheet can isolate it.
 */
export function PayslipDocument({ slip }: { slip: Payslip }) {
  const { template } = slip
  const accent = template.accentColor
  const groups = (
    template.show.employerContribs
      ? (["earning", "deduction", "employer"] as const)
      : (["earning", "deduction"] as const)
  ).filter(Boolean)
  const paymentPeriod = `${formatDocDate(slip.payPeriodStart)} – ${formatDocDate(slip.payPeriodEnd)}`

  return (
    <div
      className="payslip-print bg-card flex flex-col gap-8 rounded-lg border p-6 lg:p-8"
      style={{ fontFamily: template.fontFamily }}
    >
      {/* Header: company + payment context */}
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          {template.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={template.logoUrl}
              alt=""
              className="h-10 w-auto max-w-[180px] object-contain"
            />
          )}
          <span
            className="text-lg font-bold tracking-tight"
            style={{ color: accent }}
          >
            {slip.companyName}
          </span>
          {template.headerText && (
            <span className="text-muted-foreground text-xs whitespace-pre-line">
              {template.headerText}
            </span>
          )}
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
        {slip.proration?.prorated && (
          <InfoRow
            label="Prorated"
            value={`${slip.proration.daysWorked}/${slip.proration.totalWorkingDays} working days`}
          />
        )}
      </div>

      {/* Earnings / deductions / employer */}
      <div className="flex flex-col gap-5">
        {groups.map((g) => {
          const lines = slip.lines.filter((l) => l.type === g)
          if (lines.length === 0) return null
          const subtotal = lines.reduce((s, l) => s + l.amountCents, 0)
          return (
            <div key={g} className="flex flex-col gap-1.5">
              <div
                className="flex items-center justify-between border-b pb-1.5 text-xs font-semibold uppercase tracking-wide"
                style={{ color: accent }}
              >
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
        {template.show.cpfNote && (
          <p className="text-muted-foreground text-xs">
            CPF-eligible wage: {formatMoney(slip.cpfableWageCents, slip.currency)}.
            Employer CPF of {formatMoney(slip.employerCpfCents, slip.currency)} is
            paid on top and not deducted from your pay.
          </p>
        )}
      </div>

      {/* Signatures */}
      {template.show.signatures && slip.signatures.length > 0 && (
        <div className="grid gap-6 border-t pt-6 sm:grid-cols-2">
          {slip.signatures.map((s, i) => (
            <div key={i} className="flex flex-col gap-1">
              {s.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.url}
                  alt={`${s.name} signature`}
                  className="h-14 w-auto max-w-[200px] object-contain"
                />
              ) : (
                <div className="h-14" />
              )}
              <div className="border-t pt-1">
                <p className="text-sm font-medium">{s.name}</p>
                <p className="text-muted-foreground text-xs">{s.role}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {template.footerText && (
        <p className="text-muted-foreground border-t pt-4 text-xs whitespace-pre-line">
          {template.footerText}
        </p>
      )}
    </div>
  )
}
