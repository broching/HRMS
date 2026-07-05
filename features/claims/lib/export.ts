import type { ClaimCategory, ClaimStatus } from "@/convex/lib/enums"
import {
  toCsv,
  toExcelHtml,
  downloadFile,
  type Cell,
} from "@/features/reports/lib/export"
import {
  CLAIM_STATUS_LABELS,
  CLAIM_CATEGORY_LABELS,
  monthLabel,
} from "@/features/claims/lib/labels"

// One row as returned by `claims.exportRows` (kept in sync with that query).
export type ClaimExportRow = {
  employeeName: string
  periodMonth: string
  sequence: number
  title: string | null
  claimType: string
  category: ClaimCategory
  amountCents: number
  currency: string
  incurredDate: string
  status: ClaimStatus
  description: string
  decisionNote: string | null
  receiptCount: number
}

const HEADERS = [
  "Employee",
  "Month",
  "Batch",
  "Type",
  "Category",
  "Amount",
  "Currency",
  "Incurred date",
  "Status",
  "Description",
  "Decision note",
  "Receipts",
]

function batchLabel(r: ClaimExportRow): string {
  const base = monthLabel(r.periodMonth)
  return r.title ? `${base} · ${r.title}` : base
}

function toCells(rows: ClaimExportRow[]): Cell[][] {
  return rows.map((r) => [
    r.employeeName,
    monthLabel(r.periodMonth),
    batchLabel(r),
    r.claimType,
    CLAIM_CATEGORY_LABELS[r.category],
    (r.amountCents / 100).toFixed(2),
    r.currency,
    r.incurredDate,
    CLAIM_STATUS_LABELS[r.status],
    r.description,
    r.decisionNote ?? "",
    r.receiptCount,
  ])
}

/** Build and download a claims export (CSV or Excel) from flat export rows. */
export function downloadClaims(
  rows: ClaimExportRow[],
  format: "csv" | "excel",
  filename: string,
): void {
  const cells = toCells(rows)
  if (format === "csv") {
    downloadFile(`${filename}.csv`, toCsv(HEADERS, cells), "text/csv;charset=utf-8")
  } else {
    downloadFile(
      `${filename}.xls`,
      toExcelHtml(filename, HEADERS, cells),
      "application/vnd.ms-excel",
    )
  }
}
