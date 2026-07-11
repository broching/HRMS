import ExcelJS from "exceljs"
import type { ClaimCategory, ClaimStatus } from "@/convex/lib/enums"
import { createZip, type ZipEntry } from "@/lib/zip"
import { CLAIM_CATEGORY_LABELS, monthLabel } from "@/features/claims/lib/labels"

// One employee's claim-form bundle — mirrors `claims.exportForms` output.
export type ClaimFormRow = {
  incurredDate: string
  description: string
  claimType: string
  category: ClaimCategory
  amountCents: number
  taxAmountCents: number | null
  remarks: string | null
  status: ClaimStatus
}
export type ClaimSignature = {
  role: string
  name: string
  url: string | null
  signedAt: number
}
export type ClaimFormGroup = {
  employeeId: string
  employeeName: string
  department: string | null
  designation: string | null
  periodMonth: string
  currency: string
  claims: ClaimFormRow[]
  totalCents: number
  signatures: ClaimSignature[]
}

const cents = (c: number) => Math.round(c) / 100
const MONEY = "#,##0.00"

// Stable display order for the claim-form category columns.
const CATEGORY_ORDER: ClaimCategory[] = [
  "medical",
  "travel",
  "meals",
  "office",
  "mileage",
  "training",
  "entertainment",
  "custom",
]

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim()
}

async function fetchImageBuffer(
  url: string,
): Promise<{ buffer: ArrayBuffer; ext: "png" | "jpeg" } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const ct = res.headers.get("content-type") ?? ""
    const ext = ct.includes("jpeg") || ct.includes("jpg") ? "jpeg" : "png"
    return { buffer: await res.arrayBuffer(), ext }
  } catch {
    return null
  }
}

// Draw signature images + name/role/date at the bottom of a worksheet, starting
// at `startRow` (1-indexed). Signatures spread out horizontally, three columns
// apart. Returns the row after the block.
async function drawSignatures(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  signatures: ClaimSignature[],
  startRow: number,
): Promise<number> {
  const labelRow = ws.getRow(startRow)
  labelRow.getCell(1).value = "Signatures"
  labelRow.getCell(1).font = { bold: true }
  for (let i = 0; i < signatures.length; i++) {
    const sig = signatures[i]
    const col = 1 + i * 3
    const imgTopRow = startRow + 1
    const img = sig.url ? await fetchImageBuffer(sig.url) : null
    if (img) {
      const imageId = wb.addImage({ buffer: img.buffer, extension: img.ext })
      ws.addImage(imageId, {
        tl: { col: col - 1, row: imgTopRow - 1 },
        ext: { width: 160, height: 60 },
        editAs: "oneCell",
      })
    }
    const nameRow = ws.getRow(imgTopRow + 4)
    nameRow.getCell(col).value = sig.name
    nameRow.getCell(col).font = { bold: true }
    const roleRow = ws.getRow(imgTopRow + 5)
    roleRow.getCell(col).value = sig.role
    roleRow.getCell(col).font = { color: { argb: "FF666666" }, size: 10 }
    const dateRow = ws.getRow(imgTopRow + 6)
    dateRow.getCell(col).value = new Date(sig.signedAt).toISOString().slice(0, 10)
    dateRow.getCell(col).font = { color: { argb: "FF666666" }, size: 10 }
  }
  return startRow + 8
}

// ─── Individual claim form (staff expense claim form) ──────────────────────

// Build a single-employee staff expense claim form: a header (name /
// department / designation / month), one row per claim with the amount placed
// in its category column, category + total + GST subtotals, and the approver
// signatures at the bottom. Returned as a raw buffer so it can be zipped.
export async function buildClaimFormWorkbook(
  group: ClaimFormGroup,
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  wb.created = new Date()
  const ws = wb.addWorksheet("Claim form")

  // Only include category columns that appear in this employee's claims.
  const present = new Set(group.claims.map((c) => c.category))
  const categories = CATEGORY_ORDER.filter((c) => present.has(c))

  const headers = [
    "Item No.",
    "Date",
    "Description",
    ...categories.map((c) => CLAIM_CATEGORY_LABELS[c]),
    "Total",
    "Remarks",
    "GST Amount",
  ]
  const totalCol = 3 + categories.length + 1 // 1-indexed "Total" column
  const gstCol = headers.length

  // Title + meta.
  const title = ws.addRow(["STAFF EXPENSE CLAIM FORM"])
  title.font = { bold: true, size: 14 }
  ws.mergeCells(1, 1, 1, headers.length)
  title.getCell(1).alignment = { horizontal: "center" }
  ws.addRow([`Name: ${group.employeeName}`]).font = { bold: true }
  ws.addRow([`Department: ${group.department ?? "—"}`])
  ws.addRow([`Designation: ${group.designation ?? "—"}`])
  ws.addRow([`Month of Claims: ${monthLabel(group.periodMonth)}`])
  ws.addRow([])

  // Header row.
  const headerRowIdx = ws.rowCount + 1
  const headerRow = ws.addRow(headers)
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } }
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4F46E5" },
    }
    cell.alignment = { vertical: "middle", wrapText: true, horizontal: "center" }
    cell.border = {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" },
    }
  })

  // Data rows.
  group.claims.forEach((c, i) => {
    const row: (string | number | null)[] = [
      i + 1,
      c.incurredDate,
      c.description || c.claimType,
      ...categories.map((cat) => (cat === c.category ? cents(c.amountCents) : null)),
      cents(c.amountCents),
      c.remarks ?? "",
      c.taxAmountCents != null ? cents(c.taxAmountCents) : null,
    ]
    const r = ws.addRow(row)
    r.eachCell((cell) => {
      cell.border = {
        top: { style: "hair" },
        bottom: { style: "hair" },
        left: { style: "thin" },
        right: { style: "thin" },
      }
    })
  })

  // Totals row.
  const catTotal = (cat: ClaimCategory) =>
    group.claims
      .filter((c) => c.category === cat)
      .reduce((s, c) => s + c.amountCents, 0)
  const gstTotal = group.claims.reduce((s, c) => s + (c.taxAmountCents ?? 0), 0)
  const totalsRow = ws.addRow([
    "",
    "",
    "Total",
    ...categories.map((cat) => cents(catTotal(cat))),
    cents(group.totalCents),
    "",
    cents(gstTotal),
  ])
  totalsRow.font = { bold: true }
  totalsRow.eachCell((cell) => {
    cell.border = { top: { style: "thin" }, bottom: { style: "double" } }
  })

  // Number formats on the money columns (categories + Total + GST).
  for (let col = 4; col <= totalCol; col++) ws.getColumn(col).numFmt = MONEY
  ws.getColumn(gstCol).numFmt = MONEY
  // Column widths.
  ws.getColumn(1).width = 8
  ws.getColumn(2).width = 12
  ws.getColumn(3).width = 32
  for (let col = 4; col <= headers.length; col++) {
    ws.getColumn(col).width = Math.max(12, headers[col - 1].length + 2)
  }
  ws.views = [{ state: "frozen", ySplit: headerRowIdx }]

  if (group.signatures.length > 0) {
    await drawSignatures(wb, ws, group.signatures, ws.rowCount + 3)
  }

  return await wb.xlsx.writeBuffer()
}

// Build a ZIP of one claim form per employee, named "{Employee} — {month}.xlsx".
export async function buildClaimFormsZip(
  groups: ClaimFormGroup[],
  fileMonth: string,
): Promise<Blob> {
  const entries: ZipEntry[] = []
  for (const group of groups) {
    const buffer = await buildClaimFormWorkbook(group)
    entries.push({
      name: `${safeName(group.employeeName)} — ${fileMonth}.xlsx`,
      data: buffer,
    })
  }
  return createZip(entries)
}

// ─── Monthly totals (bank-payment listing) ─────────────────────────────────

// Build the monthly totals listing: one row per employee (payee) with their
// total accumulated claim amount for the month, plus a grand Total row. Mirrors
// the bank payment listing (Payee · Description · Value date · Amount).
export async function buildMonthlyTotalsWorkbook(opts: {
  groups: ClaimFormGroup[]
  periodMonth: string
  valueDate: string
}): Promise<Blob> {
  const { groups, periodMonth, valueDate } = opts
  const wb = new ExcelJS.Workbook()
  wb.created = new Date()
  const ws = wb.addWorksheet("Claims total")

  const title = ws.addRow([`Claims total — ${monthLabel(periodMonth)}`])
  title.font = { bold: true, size: 14 }
  ws.addRow([])

  const headers = ["Payee", "Description", "Value date", "Amount", "Currency"]
  const headerRow = ws.addRow(headers)
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } }
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4F46E5" },
    }
  })

  const shortMonth = () => {
    const [y, m] = periodMonth.split("-").map(Number)
    const d = new Date(Date.UTC(y, (m || 1) - 1, 1))
    return `${d.toLocaleString("en", { month: "short" })}'${String(y).slice(2)}`
  }
  const desc = `${shortMonth()} Claims`

  for (const g of groups) {
    ws.addRow([g.employeeName, desc, valueDate, cents(g.totalCents), g.currency])
  }

  const grand = groups.reduce((s, g) => s + g.totalCents, 0)
  const totalRow = ws.addRow(["", "", "Total", cents(grand), groups[0]?.currency ?? ""])
  totalRow.font = { bold: true }
  totalRow.eachCell((cell) => {
    cell.border = { top: { style: "thin" }, bottom: { style: "double" } }
  })

  ws.getColumn(4).numFmt = MONEY
  ws.getColumn(1).width = 32
  ws.getColumn(2).width = 20
  ws.getColumn(3).width = 14
  ws.getColumn(4).width = 16
  ws.getColumn(5).width = 10

  const signatures = unionSignatures(groups)
  if (signatures.length > 0) {
    await drawSignatures(wb, ws, signatures, ws.rowCount + 3)
  }

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}

// Union of approver signatures across every employee in scope, de-duped by
// role+name and ordered by signing time.
function unionSignatures(groups: ClaimFormGroup[]): ClaimSignature[] {
  const seen = new Map<string, ClaimSignature>()
  for (const g of groups) {
    for (const s of g.signatures) {
      const key = `${s.name}:${s.role}`
      if (!seen.has(key)) seen.set(key, s)
    }
  }
  return [...seen.values()].sort((a, b) => a.signedAt - b.signedAt)
}

// ─── Flat claims list (approver export) ────────────────────────────────────

// Build the approver's claims list workbook: one row per claim across all
// employees in scope, a grand total row, and the union of approver signatures
// rendered at the bottom.
export async function buildClaimsListWorkbook(opts: {
  groups: ClaimFormGroup[]
  periodMonth: string
}): Promise<Blob> {
  const { groups, periodMonth } = opts
  const wb = new ExcelJS.Workbook()
  wb.created = new Date()
  const ws = wb.addWorksheet("Claims")

  const title = ws.addRow([`Claims — ${monthLabel(periodMonth)}`])
  title.font = { bold: true, size: 14 }
  ws.addRow([])

  const headers = [
    "Employee",
    "Date",
    "Type",
    "Category",
    "Description",
    "Amount",
    "GST",
    "Currency",
  ]
  const headerRowIdx = ws.rowCount + 1
  const headerRow = ws.addRow(headers)
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } }
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4F46E5" },
    }
  })

  let grand = 0
  let gstGrand = 0
  for (const g of groups) {
    for (const c of g.claims) {
      grand += c.amountCents
      gstGrand += c.taxAmountCents ?? 0
      ws.addRow([
        g.employeeName,
        c.incurredDate,
        c.claimType,
        CLAIM_CATEGORY_LABELS[c.category],
        c.description,
        cents(c.amountCents),
        c.taxAmountCents != null ? cents(c.taxAmountCents) : null,
        g.currency,
      ])
    }
  }

  const totalRow = ws.addRow([
    "Grand total",
    "",
    "",
    "",
    "",
    cents(grand),
    cents(gstGrand),
    "",
  ])
  totalRow.font = { bold: true }
  totalRow.eachCell((cell) => {
    cell.border = { top: { style: "thin" }, bottom: { style: "double" } }
  })

  ws.getColumn(6).numFmt = MONEY
  ws.getColumn(7).numFmt = MONEY
  ws.getColumn(1).width = 26
  ws.getColumn(2).width = 12
  ws.getColumn(3).width = 20
  ws.getColumn(4).width = 16
  ws.getColumn(5).width = 32
  ws.getColumn(6).width = 14
  ws.getColumn(7).width = 12
  ws.getColumn(8).width = 10
  ws.views = [{ state: "frozen", ySplit: headerRowIdx }]

  // Union of signatures across every employee in scope (de-duped by role+name).
  const signatures = unionSignatures(groups)
  if (signatures.length > 0) {
    await drawSignatures(wb, ws, signatures, ws.rowCount + 3)
  }

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}

// Trigger a browser download for a Blob.
export function downloadClaimBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
