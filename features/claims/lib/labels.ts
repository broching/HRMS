import type { ClaimStatus, ClaimCategory } from "@/convex/lib/enums"

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  pending_manager: "Pending manager",
  pending_finance: "Pending finance",
  approved: "Approved",
  rejected: "Rejected",
  reimbursed: "Reimbursed",
  cancelled: "Cancelled",
}

export const CLAIM_STATUS_BADGE: Record<
  ClaimStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  pending_manager: "secondary",
  pending_finance: "secondary",
  approved: "default",
  rejected: "destructive",
  reimbursed: "default",
  cancelled: "outline",
}

export const CLAIM_CATEGORY_LABELS: Record<ClaimCategory, string> = {
  medical: "Medical",
  travel: "Travel",
  meals: "Meals",
  office: "Office",
  mileage: "Mileage",
  training: "Training",
  entertainment: "Entertainment",
  custom: "Custom",
}

// The ordered workflow stages for the status timeline.
export const CLAIM_FLOW: ClaimStatus[] = [
  "pending_manager",
  "pending_finance",
  "approved",
  "reimbursed",
]

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
