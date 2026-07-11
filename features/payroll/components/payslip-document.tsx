"use client"

import * as React from "react"
import type { FunctionReturnType } from "convex/server"
import { api } from "@/convex/_generated/api"
import { cn } from "@/lib/utils"
import {
  CPF_STATUS_LABELS,
  formatDocDate,
  formatMoney,
  prYearLabel,
} from "@/features/payroll/lib/labels"
import {
  DENSITY_GAP_REM,
  normalizeLayout,
  type LayoutBlock,
} from "@/features/payroll/lib/payslip-layout"
import type { PayslipBlockType, PayslipDensity } from "@/convex/lib/enums"

type Payslip = FunctionReturnType<typeof api.payroll.getPayslip>
type LineType = "earning" | "deduction" | "employer"

const TYPE_LABEL: Record<LineType, string> = {
  earning: "Earnings",
  deduction: "Deductions",
  employer: "Employer contributions",
}

// em-based sizes so the whole document scales with the root font-size (which we
// drive from the template's fontScale). font-* weights are size-independent.
const T = {
  xs: "text-[0.75em]",
  sm: "text-[0.875em]",
  base: "text-[1em]",
  lg: "text-[1.125em]",
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn("flex gap-2", T.sm)}>
      <span className="text-muted-foreground font-medium">{label}:</span>
      <span>{value}</span>
    </div>
  )
}

// Map a stored (or legacy) template to the block list to render. When the
// template has no explicit layout we synthesize one from the legacy `show`
// toggles so old templates keep rendering identically.
function effectiveLayout(template: Payslip["template"]): LayoutBlock[] {
  if (template.layout && template.layout.length > 0) {
    return normalizeLayout(template.layout as LayoutBlock[])
  }
  const s = template.show
  const base = normalizeLayout(null) // default structural order
  return base.map((b) => {
    let visible = b.visible
    if (b.type === "employerContribs") visible = s.employerContribs
    if (b.type === "cpfNote") visible = s.cpfNote
    if (b.type === "signatures") visible = s.signatures
    return { ...b, visible }
  })
}

/**
 * The printable payslip body, driven by the run's payslip template: a
 * drag-and-drop block layout (order + visibility + custom text/divider/spacer
 * blocks), plus accent colour, body text colour, font family, font scale and
 * vertical density. Rendered inside a `.payslip-print` container so the print
 * stylesheet can isolate it.
 */
export function PayslipDocument({ slip }: { slip: Payslip }) {
  const { template } = slip
  const accent = template.accentColor
  const density: PayslipDensity = template.density ?? "normal"
  const scale = template.fontScale ?? 1
  const blocks = effectiveLayout(template).filter((b) => b.visible)

  function Group({ type }: { type: LineType }) {
    const lines = slip.lines.filter((l) => l.type === type)
    if (lines.length === 0) return null
    const subtotal = lines.reduce((s, l) => s + l.amountCents, 0)
    return (
      <div className="flex flex-col gap-1.5">
        <div
          className={cn(
            "flex items-center justify-between border-b pb-1.5 font-semibold uppercase tracking-wide",
            T.xs,
          )}
          style={{ color: accent }}
        >
          <span>{TYPE_LABEL[type]}</span>
          <span>Amount</span>
        </div>
        {lines.map((l, i) => (
          <div key={i} className={cn("flex items-center justify-between", T.sm)}>
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
        <div
          className={cn(
            "flex items-center justify-between border-t pt-1.5 font-medium",
            T.sm,
          )}
        >
          <span>Total</span>
          <span className="tabular-nums">
            {formatMoney(subtotal, slip.currency)}
          </span>
        </div>
      </div>
    )
  }

  function renderBlock(block: LayoutBlock): React.ReactNode {
    const type = block.type as PayslipBlockType
    switch (type) {
      case "header":
        // Legacy combined block — kept for any un-migrated template. New
        // templates render logo / companyName / headerText as separate blocks.
        return (
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
              className={cn("font-bold tracking-tight", T.lg)}
              style={{ color: accent }}
            >
              {slip.companyName}
            </span>
            {template.headerText && (
              <span
                className={cn(
                  "text-muted-foreground whitespace-pre-line",
                  T.xs,
                )}
              >
                {template.headerText}
              </span>
            )}
          </div>
        )
      case "logo":
        if (!template.logoUrl) return null
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={template.logoUrl}
            alt=""
            className="block h-10 w-auto max-w-[180px] object-contain"
          />
        )
      case "companyName":
        return (
          <span
            className={cn("block font-bold tracking-tight", T.lg)}
            style={{ color: accent }}
          >
            {slip.companyName}
          </span>
        )
      case "headerText":
        if (!template.headerText) return null
        return (
          <span
            className={cn(
              "text-muted-foreground block whitespace-pre-line",
              T.xs,
            )}
          >
            {template.headerText}
          </span>
        )
      case "payMeta":
        return (
          <div className="flex flex-col gap-1 sm:items-end sm:text-right">
            <InfoRow
              label="Payment Period"
              value={`${formatDocDate(slip.payPeriodStart)} – ${formatDocDate(slip.payPeriodEnd)}`}
            />
            <InfoRow
              label="Date of Payment"
              value={slip.payDate ? formatDocDate(slip.payDate) : "Pending"}
            />
          </div>
        )
      case "employeeDetails":
        return (
          <div className="grid gap-2 sm:grid-cols-2">
            <InfoRow label="Name" value={slip.employeeName} />
            <InfoRow label="Employee ID" value={slip.employeeNumber} />
            <InfoRow label="Department" value={slip.departmentName ?? "—"} />
            <InfoRow label="Occupation" value={slip.positionTitle ?? "—"} />
            <InfoRow
              label="CPF status"
              value={
                CPF_STATUS_LABELS[slip.cpfStatus] +
                (slip.cpfStatus === "pr" && slip.prYear
                  ? ` · ${prYearLabel(slip.prYear)}`
                  : "")
              }
            />
            {slip.proration?.prorated && (
              <InfoRow
                label="Prorated"
                value={`${slip.proration.daysWorked}/${slip.proration.totalWorkingDays} working days`}
              />
            )}
          </div>
        )
      case "earnings":
        return <Group type="earning" />
      case "deductions":
        return <Group type="deduction" />
      case "employerContribs":
        return <Group type="employer" />
      case "totals":
        return (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">Gross pay</span>
              <span className="tabular-nums">
                {formatMoney(slip.grossCents, slip.currency)}
              </span>
            </div>
            <div
              className={cn(
                "flex items-center justify-between font-semibold",
                T.lg,
              )}
            >
              <span>Net pay</span>
              <span className="tabular-nums">
                {formatMoney(slip.netCents, slip.currency)}
              </span>
            </div>
          </div>
        )
      case "exchangeInfo": {
        const base = slip.baseCurrency
        const rate = slip.exchangeRate
        if (!base || base === slip.currency || !rate) return null
        const baseNet = Math.round(slip.netCents * rate)
        const meta = [slip.exchangeProvider, slip.exchangeRateDate]
          .filter(Boolean)
          .join(" · ")
        return (
          <p className={cn("text-muted-foreground", T.xs)}>
            Paid in {slip.currency}. 1 {slip.currency} ={" "}
            {rate.toLocaleString(undefined, { maximumFractionDigits: 6 })} {base}
            {meta ? ` (${meta})` : ""}. Net ≈ {formatMoney(baseNet, base)}.
          </p>
        )
      }
      case "cpfNote":
        return (
          <p className={cn("text-muted-foreground", T.xs)}>
            CPF-eligible wage: {formatMoney(slip.cpfableWageCents, slip.currency)}
            . Employer CPF of{" "}
            {formatMoney(slip.employerCpfCents, slip.currency)} is paid on top
            and not deducted from your pay.
          </p>
        )
      case "signatures":
        if (slip.signatures.length === 0) return null
        return (
          <div className="grid gap-6 sm:grid-cols-2">
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
                  <p className={cn("font-medium", T.sm)}>{s.name}</p>
                  <p className={cn("text-muted-foreground", T.xs)}>{s.role}</p>
                </div>
              </div>
            ))}
          </div>
        )
      case "footer":
        if (!template.footerText) return null
        return (
          <p
            className={cn(
              "text-muted-foreground whitespace-pre-line",
              T.xs,
            )}
          >
            {template.footerText}
          </p>
        )
      case "customText":
        if (!block.text) return null
        return (
          <p
            className={cn(
              "whitespace-pre-line",
              block.heading ? cn("font-semibold", T.lg) : T.sm,
              block.align === "center" && "text-center",
              block.align === "right" && "text-right",
            )}
            style={block.heading ? { color: accent } : undefined}
          >
            {block.text}
          </p>
        )
      case "divider":
        return <hr className="border-t" />
      case "spacer":
        return <div className="h-4" aria-hidden />
      default:
        return null
    }
  }

  return (
    <div
      className="payslip-print bg-card flex flex-col rounded-lg border p-6 lg:p-8"
      style={{
        fontFamily: template.fontFamily,
        fontSize: `${16 * scale}px`,
        color: template.textColor ?? undefined,
        gap: `${DENSITY_GAP_REM[density]}rem`,
      }}
    >
      {blocks.map((block) => {
        const node = renderBlock(block)
        if (node === null) return null
        return <div key={block.id}>{node}</div>
      })}
    </div>
  )
}
