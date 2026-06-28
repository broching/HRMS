import type { PayrollStatus, CpfStatus } from "@/convex/lib/enums"

export const PAYROLL_STATUS_LABELS: Record<PayrollStatus, string> = {
  draft: "Draft",
  finalized: "Finalized",
  paid: "Paid",
}

export const PAYROLL_STATUS_BADGE: Record<
  PayrollStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  draft: "secondary",
  finalized: "default",
  paid: "default",
}

export const CPF_STATUS_LABELS: Record<CpfStatus, string> = {
  citizen_pr: "Citizen / PR",
  foreigner: "Foreigner",
  exempt: "Exempt",
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
