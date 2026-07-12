import type { PaymentRequestStatus } from "@/convex/lib/enums"

export const PR_STATUS_LABELS: Record<PaymentRequestStatus, string> = {
  draft: "Draft",
  pending_manager: "Pending approval",
  pending_finance: "Pending finance",
  approved: "Approved",
  rejected: "Rejected",
  paid: "Paid",
}

export const PR_STATUS_BADGE: Record<
  PaymentRequestStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  draft: "outline",
  pending_manager: "secondary",
  pending_finance: "secondary",
  approved: "default",
  rejected: "destructive",
  paid: "default",
}

// Human-friendly reference, e.g. "PR-0007".
export function requestRef(n: number): string {
  return `PR-${String(n).padStart(4, "0")}`
}

// ─── Sorting ───────────────────────────────────────────────────────────────

export type PrSortKey =
  | "submitted_desc"
  | "submitted_asc"
  | "date_desc"
  | "date_asc"
  | "invoice_desc"
  | "invoice_asc"

export const PR_SORT_OPTIONS: { value: PrSortKey; label: string }[] = [
  { value: "submitted_desc", label: "Newest first" },
  { value: "submitted_asc", label: "Oldest first" },
  { value: "date_desc", label: "Date (newest)" },
  { value: "date_asc", label: "Date (oldest)" },
  { value: "invoice_desc", label: "Invoice date (newest)" },
  { value: "invoice_asc", label: "Invoice date (oldest)" },
]

type PrSortable = {
  _creationTime: number
  requestDate: string
  invoiceDate: string | null
}

// Stable client-side sort. Rows missing the chosen date sort to the bottom
// regardless of direction, so a blank invoice date never jumps to the top.
export function sortPaymentRequests<T extends PrSortable>(
  rows: T[],
  key: PrSortKey,
): T[] {
  const out = [...rows]
  const byDate = (
    a: string | null,
    b: string | null,
    dir: 1 | -1,
  ): number => {
    if (!a && !b) return 0
    if (!a) return 1 // missing always last
    if (!b) return -1
    return a < b ? -dir : a > b ? dir : 0
  }
  switch (key) {
    case "submitted_asc":
      out.sort((a, b) => a._creationTime - b._creationTime)
      break
    case "date_desc":
      out.sort((a, b) => byDate(a.requestDate, b.requestDate, 1))
      break
    case "date_asc":
      out.sort((a, b) => byDate(a.requestDate, b.requestDate, -1))
      break
    case "invoice_desc":
      out.sort((a, b) => byDate(a.invoiceDate, b.invoiceDate, 1))
      break
    case "invoice_asc":
      out.sort((a, b) => byDate(a.invoiceDate, b.invoiceDate, -1))
      break
    case "submitted_desc":
    default:
      out.sort((a, b) => b._creationTime - a._creationTime)
      break
  }
  return out
}

// Re-exported month/money helpers so payment-request components don't reach into
// the claims feature for shared primitives.
export {
  currentMonth,
  addMonth,
  monthLabel,
  formatMoney,
  CURRENCIES,
} from "@/features/claims/lib/labels"
