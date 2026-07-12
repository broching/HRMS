import ExcelJS from "exceljs"
import type { PaymentRequestStatus } from "@/convex/lib/enums"
import { PR_STATUS_LABELS, monthLabel, requestRef } from "@/features/payment-requests/lib/labels"
import { countryName } from "@/lib/countries"

export type PaymentRequestExportRow = {
  requestNumber: number
  employeeName: string
  purpose: string
  payeeName: string
  country: string | null
  amountCents: number
  currency: string
  requestDate: string
  status: PaymentRequestStatus
  signatures: { role: string; name: string; url: string | null; signedAt: number }[]
}

const cents = (c: number) => Math.round(c) / 100
const MONEY = "#,##0.00"

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

// Union of approver signatures across the requests, de-duped by role+name.
function unionSignatures(rows: PaymentRequestExportRow[]) {
  const seen = new Map<string, PaymentRequestExportRow["signatures"][number]>()
  for (const r of rows) {
    for (const s of r.signatures) {
      const key = `${s.name}:${s.role}`
      if (!seen.has(key)) seen.set(key, s)
    }
  }
  return [...seen.values()].sort((a, b) => a.signedAt - b.signedAt)
}

async function drawSignatures(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  signatures: PaymentRequestExportRow["signatures"],
  startRow: number,
) {
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
}

// One row per payment request (each item + payee on its own row), a grand total,
// and the union of approver signatures at the bottom.
export async function buildPaymentRequestsWorkbook(opts: {
  rows: PaymentRequestExportRow[]
  periodMonth: string
}): Promise<Blob> {
  const { rows, periodMonth } = opts
  const wb = new ExcelJS.Workbook()
  wb.created = new Date()
  const ws = wb.addWorksheet("Payment requests")

  const title = ws.addRow([`Payment requests — ${monthLabel(periodMonth)}`])
  title.font = { bold: true, size: 14 }
  ws.addRow([])

  const headers = [
    "Ref",
    "Requestor",
    "Payee",
    "Country",
    "Purpose",
    "Date",
    "Amount",
    "Currency",
    "Status",
  ]
  const headerRowIdx = ws.rowCount + 1
  const headerRow = ws.addRow(headers)
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } }
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } }
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }
  })

  let grand = 0
  for (const r of rows) {
    grand += r.amountCents
    ws.addRow([
      requestRef(r.requestNumber),
      r.employeeName,
      r.payeeName,
      countryName(r.country),
      r.purpose,
      r.requestDate,
      cents(r.amountCents),
      r.currency,
      PR_STATUS_LABELS[r.status],
    ])
  }

  const totalRow = ws.addRow(["", "", "", "", "", "Total", cents(grand), rows[0]?.currency ?? "", ""])
  totalRow.font = { bold: true }
  totalRow.eachCell((cell) => {
    cell.border = { top: { style: "thin" }, bottom: { style: "double" } }
  })

  ws.getColumn(7).numFmt = MONEY
  ws.getColumn(1).width = 12
  ws.getColumn(2).width = 24
  ws.getColumn(3).width = 26
  ws.getColumn(4).width = 16
  ws.getColumn(5).width = 36
  ws.getColumn(6).width = 12
  ws.getColumn(7).width = 14
  ws.getColumn(8).width = 10
  ws.getColumn(9).width = 16
  ws.views = [{ state: "frozen", ySplit: headerRowIdx }]

  const signatures = unionSignatures(rows)
  if (signatures.length > 0) {
    await drawSignatures(wb, ws, signatures, ws.rowCount + 3)
  }

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}
