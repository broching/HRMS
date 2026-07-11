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

// Re-exported month/money helpers so payment-request components don't reach into
// the claims feature for shared primitives.
export {
  currentMonth,
  addMonth,
  monthLabel,
  formatMoney,
  CURRENCIES,
} from "@/features/claims/lib/labels"
