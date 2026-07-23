import type { Ir8aCategory } from "@/convex/lib/enums"

// Display labels for IR8A income categories, in IRAS form order.
export const IR8A_CATEGORIES: Ir8aCategory[] = [
  "grossSalary",
  "bonus",
  "directorsFee",
  "allowancesTaxable",
  "commission",
  "gratuityExGratia",
  "otherIncome",
]

export const IR8A_CATEGORY_LABELS: Record<Ir8aCategory, string> = {
  grossSalary: "Gross salary / wages",
  bonus: "Bonus",
  directorsFee: "Director's fees",
  allowancesTaxable: "Allowances (taxable)",
  commission: "Commission",
  gratuityExGratia: "Gratuity / ex-gratia",
  otherIncome: "Other income",
}

// The variance/attention flags a form can carry, with human copy.
export const IR8A_FLAG_LABELS: Record<string, string> = {
  missing_id: "Missing NRIC/FIN",
  unmapped_income: "Unclassified income",
  negative: "Negative amount",
}
