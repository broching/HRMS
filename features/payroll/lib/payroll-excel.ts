import ExcelJS from "exceljs"
import { createZip, type ZipEntry } from "@/lib/zip"

// Minimal shapes the exporter needs (a subset of the payroll workspace row).
export type ExcelLine = {
  label: string
  amountCents: number
  type: "earning" | "deduction" | "employer"
}
export type ExcelPayslip = {
  employeeName: string
  currency: string
  baseCurrency: string | null
  exchangeRate: number | null
  exchangeRateDate: string | null
  grossCents: number
  netCents: number
  lines: ExcelLine[]
}
export type ExcelSignature = {
  role: string
  name: string
  url: string | null
  signedAt: number
}

const cents = (c: number) => Math.round(c) / 100

// Distinct labels of a given line type across all payslips, in first-seen order.
function labelsOfType(
  payslips: ExcelPayslip[],
  type: ExcelLine["type"],
): string[] {
  const seen: string[] = []
  const set = new Set<string>()
  for (const p of payslips) {
    for (const l of p.lines) {
      if (l.type === type && !set.has(l.label)) {
        set.add(l.label)
        seen.push(l.label)
      }
    }
  }
  return seen
}

// Sum a payslip's line amounts (in dollars) for a given label + type.
function amountFor(
  p: ExcelPayslip,
  label: string,
  type: ExcelLine["type"],
): number | null {
  let total = 0
  let found = false
  for (const l of p.lines) {
    if (l.type === type && l.label === label) {
      total += l.amountCents
      found = true
    }
  }
  return found ? cents(total) : null
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

/**
 * Build the detailed payroll workbook: one row per employee with a column for
 * every distinct line item (grouped earnings → gross → deductions → net →
 * employer contributions), plus per-employee currency, exchange rate and rate
 * date, and the net converted to the base currency. When the run is approved,
 * approver signature images are embedded at the bottom.
 */
export async function buildDetailedWorkbook(opts: {
  title: string
  periodLabel: string
  baseCurrency: string
  payslips: ExcelPayslip[]
  signatures: ExcelSignature[]
}): Promise<Blob> {
  const { title, periodLabel, baseCurrency, payslips, signatures } = opts
  const wb = new ExcelJS.Workbook()
  wb.created = new Date()
  const ws = wb.addWorksheet("Payroll")

  const earnings = labelsOfType(payslips, "earning")
  const deductions = labelsOfType(payslips, "deduction")
  const employer = labelsOfType(payslips, "employer")

  // Header columns.
  const headers = [
    "Employee",
    "Currency",
    ...earnings,
    "Gross",
    ...deductions,
    "Net",
    ...employer,
    "Exchange rate",
    "Rate date",
    `Net (${baseCurrency})`,
  ]

  // Title + period rows.
  ws.addRow([title])
  ws.getRow(1).font = { bold: true, size: 14 }
  ws.addRow([`Pay period: ${periodLabel}`])
  ws.getRow(2).font = { italic: true, color: { argb: "FF666666" } }
  ws.addRow([])

  const headerRowIdx = ws.rowCount + 1
  const headerRow = ws.addRow(headers)
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } }
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4F46E5" },
    }
    cell.alignment = { vertical: "middle", wrapText: true }
  })

  // Data rows.
  for (const p of payslips) {
    const rate =
      p.exchangeRate ?? (p.baseCurrency && p.currency === p.baseCurrency ? 1 : null)
    const row: (string | number | null)[] = [
      p.employeeName,
      p.currency,
      ...earnings.map((l) => amountFor(p, l, "earning")),
      cents(p.grossCents),
      ...deductions.map((l) => amountFor(p, l, "deduction")),
      cents(p.netCents),
      ...employer.map((l) => amountFor(p, l, "employer")),
      rate,
      p.exchangeRateDate ?? "",
      rate != null ? cents(Math.round(p.netCents * rate)) : null,
    ]
    ws.addRow(row)
  }

  // Grand total row: sum every money column across all employees (the
  // per-line/gross/net/employer columns and the base-currency net). Currency,
  // exchange-rate and rate-date columns aren't summed. Amounts sum in each
  // column's own units; the authoritative cross-currency figure is Net (base).
  {
    const sumLine = (type: ExcelLine["type"], label: string) => {
      let total = 0
      let found = false
      for (const p of payslips) {
        const a = amountFor(p, label, type)
        if (a != null) {
          total += a
          found = true
        }
      }
      return found ? +total.toFixed(2) : null
    }
    const netBaseTotal = payslips.reduce((s, p) => {
      const rate =
        p.exchangeRate ??
        (p.baseCurrency && p.currency === p.baseCurrency ? 1 : null)
      return rate != null ? s + Math.round(p.netCents * rate) : s
    }, 0)
    const totalRow: (string | number | null)[] = [
      "Grand total",
      "",
      ...earnings.map((l) => sumLine("earning", l)),
      cents(payslips.reduce((s, p) => s + p.grossCents, 0)),
      ...deductions.map((l) => sumLine("deduction", l)),
      cents(payslips.reduce((s, p) => s + p.netCents, 0)),
      ...employer.map((l) => sumLine("employer", l)),
      "",
      "",
      cents(netBaseTotal),
    ]
    const row = ws.addRow(totalRow)
    row.font = { bold: true }
    row.eachCell((cell) => {
      cell.border = { top: { style: "thin" }, bottom: { style: "double" } }
    })
  }

  // Number formatting for the money + rate columns.
  const firstMoneyCol = 3 // after Employee, Currency
  const lastMoneyCol = headers.length
  for (let c = firstMoneyCol; c <= lastMoneyCol; c++) {
    const header = headers[c - 1]
    const col = ws.getColumn(c)
    if (header === "Exchange rate") col.numFmt = "0.000000"
    else if (header === "Rate date") col.numFmt = "@"
    else col.numFmt = "#,##0.00"
  }
  // Column widths.
  ws.getColumn(1).width = 24
  for (let c = 2; c <= headers.length; c++) {
    ws.getColumn(c).width = Math.max(12, headers[c - 1].length + 2)
  }
  ws.views = [{ state: "frozen", ySplit: headerRowIdx, xSplit: 1 }]

  // Signatures block at the bottom (once approved).
  if (signatures.length > 0) {
    await drawSignatures(wb, ws, signatures, ws.rowCount + 3)
  }

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}

// ─── Per-employee payslip workbook + bulk ZIP ──────────────────────────────

// Filesystem-safe slice of a name (for zip entry filenames).
function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim()
}

// Draw the signature images + names/roles at the bottom of a worksheet,
// starting at `startRow`. Shared by the detailed workbook and per-employee
// payslips. Returns nothing; mutates the worksheet.
async function drawSignatures(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  signatures: ExcelSignature[],
  startRow: number,
): Promise<void> {
  const labelRow = ws.getRow(startRow)
  labelRow.getCell(1).value = "Approved & signed by:"
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

// Build a single-employee payslip workbook: header, grouped earnings /
// deductions / employer contributions, net pay, and (once approved) the run's
// signatures at the bottom. Returned as a raw buffer so it can be zipped.
export async function buildPayslipWorkbook(opts: {
  title: string
  periodLabel: string
  payslip: ExcelPayslip
  signatures: ExcelSignature[]
}): Promise<ArrayBuffer> {
  const { title, periodLabel, payslip, signatures } = opts
  const wb = new ExcelJS.Workbook()
  wb.created = new Date()
  const ws = wb.addWorksheet("Payslip")
  ws.getColumn(1).width = 36
  ws.getColumn(2).width = 18
  ws.getColumn(2).numFmt = "#,##0.00"

  const titleRow = ws.addRow([title])
  titleRow.font = { bold: true, size: 14 }
  ws.addRow([payslip.employeeName]).font = { bold: true, size: 12 }
  const metaRow = ws.addRow([`Pay period: ${periodLabel} · ${payslip.currency}`])
  metaRow.font = { italic: true, color: { argb: "FF666666" } }
  ws.addRow([])

  const section = (heading: string, type: ExcelLine["type"]) => {
    const lines = payslip.lines.filter((l) => l.type === type)
    if (lines.length === 0) return
    const h = ws.addRow([heading])
    h.font = { bold: true }
    h.getCell(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEEF0FF" },
    }
    for (const l of lines) {
      const r = ws.addRow([l.label, cents(l.amountCents)])
      r.getCell(2).numFmt = "#,##0.00"
    }
  }

  section("Earnings", "earning")
  const gross = ws.addRow(["Gross pay", cents(payslip.grossCents)])
  gross.font = { bold: true }
  gross.getCell(2).numFmt = "#,##0.00"
  ws.addRow([])
  section("Deductions", "deduction")
  ws.addRow([])
  section("Employer contributions", "employer")
  ws.addRow([])
  const net = ws.addRow(["Net pay", cents(payslip.netCents)])
  net.font = { bold: true, size: 12 }
  net.getCell(2).numFmt = "#,##0.00"
  net.eachCell((cell) => {
    cell.border = { top: { style: "thin" }, bottom: { style: "double" } }
  })

  if (payslip.baseCurrency && payslip.currency !== payslip.baseCurrency && payslip.exchangeRate) {
    ws.addRow([])
    const base = ws.addRow([
      `Net (${payslip.baseCurrency}) @ ${payslip.exchangeRate}`,
      cents(Math.round(payslip.netCents * payslip.exchangeRate)),
    ])
    base.getCell(2).numFmt = "#,##0.00"
  }

  if (signatures.length > 0) {
    await drawSignatures(wb, ws, signatures, ws.rowCount + 3)
  }

  return await wb.xlsx.writeBuffer()
}

// Build a ZIP of one payslip workbook per employee, each named
// "{Employee} — {month}.xlsx". Used by the "Download all payslips" action.
export async function buildPayslipsZip(opts: {
  title: string
  periodLabel: string
  fileMonth: string
  payslips: ExcelPayslip[]
  signatures: ExcelSignature[]
}): Promise<Blob> {
  const entries: ZipEntry[] = []
  for (const payslip of opts.payslips) {
    const buffer = await buildPayslipWorkbook({
      title: opts.title,
      periodLabel: opts.periodLabel,
      payslip,
      signatures: opts.signatures,
    })
    entries.push({
      name: `${safeName(payslip.employeeName)} — ${opts.fileMonth}.xlsx`,
      data: buffer,
    })
  }
  return createZip(entries)
}

// Trigger a browser download for a Blob.
export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
