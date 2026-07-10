import type {
  PayrollStatus,
  CpfStatus,
  PayrollAdjustmentSource,
} from "@/convex/lib/enums"

export const PAYROLL_STATUS_LABELS: Record<PayrollStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  finalized: "Finalized",
  paid: "Paid",
}

export const PAYROLL_STATUS_BADGE: Record<
  PayrollStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  draft: "secondary",
  pending_approval: "outline",
  approved: "default",
  finalized: "default",
  paid: "default",
}

export const CPF_STATUS_LABELS: Record<CpfStatus, string> = {
  citizen_pr: "Citizen / PR",
  foreigner: "Foreigner",
  exempt: "Exempt",
}

export const ADJUSTMENT_SOURCE_LABELS: Record<PayrollAdjustmentSource, string> =
  {
    manual: "Manual",
    claim: "Claim",
    overtime: "Overtime",
    unpaid_leave: "No-pay leave",
  }

/** Cents → localized currency string. */
export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}

/** Parse a dollars string ("1,234.50") into integer cents, or null. */
export function dollarsToCents(value: string): number | null {
  const cleaned = value.replace(/[, ]/g, "").trim()
  if (cleaned === "") return null
  const n = Number(cleaned)
  if (Number.isNaN(n) || n < 0) return null
  return Math.round(n * 100)
}

/** Cents → plain "1234.50" for editable inputs. */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2)
}

export function currentPeriodMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

/** "2026-06" → { year: "2026", monthIndex: 5, monthName: "June" }. */
export function splitPeriod(periodMonth: string): {
  year: string
  monthIndex: number
  monthName: string
} {
  const [year, m] = periodMonth.split("-")
  const monthIndex = Number(m) - 1
  return { year, monthIndex, monthName: MONTH_NAMES[monthIndex] ?? m }
}

/** Pretty date for the payslip header, e.g. "2026-06-30" → "30 Jun 2026". */
export function formatDocDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

/** Build CSV text from a header row + data rows, quoting each cell. */
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  return [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n")
}

/** Trigger a browser download of `content` as `filename`. */
export function downloadFile(
  filename: string,
  content: string,
  mime = "text/csv;charset=utf-8",
): void {
  if (typeof window === "undefined") return
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Cents → plain "1234.50" for CSV cells (no thousands separator). */
export function centsToCsv(cents: number): string {
  return (cents / 100).toFixed(2)
}

/**
 * Print the page. Combined with the `@media print` rules in globals.css that
 * hide everything except the `.payslip-print` region, this saves the payslip
 * as a PDF via the browser's print dialog.
 */
export function printPayslip(): void {
  if (typeof window !== "undefined") window.print()
}
