"use client"

import { jsPDF } from "jspdf"
import type { FunctionReturnType } from "convex/server"
import type { api } from "@/convex/_generated/api"
import { createZip, type ZipEntry } from "@/lib/zip"
import { IR8A_CATEGORIES } from "@/features/payroll/lib/ir8a-labels"

type ByYear = NonNullable<FunctionReturnType<typeof api.ir8a.getByYear>>
type Form = ByYear["forms"][number]

// IRAS rounding: income rounds DOWN to the nearest dollar, deductions round UP.
const incomeDollars = (cents: number) => Math.floor(cents / 100)
const deductionDollars = (cents: number) => Math.ceil(cents / 100)
const money = (dollars: number) =>
  dollars.toLocaleString("en-SG", { minimumFractionDigits: 0 })

function safeName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

// Mandatory retention statement IRAS requires on AIS employers' IR8A printouts.
const AIS_STATEMENT =
  "This statement can only be issued by an employer in the Auto-Inclusion " +
  "Scheme (AIS) and is for your retention. The information in this statement " +
  "will be automatically included in your income tax return, so you need not " +
  "declare them in your tax form. You can check if your employer is in the AIS " +
  "at IRAS website, https://go.gov.sg/iras-ais-search."

// Draw one IR8A form onto a jsPDF doc, mirroring the official IRAS Form IR8A
// (YA 2026): particulars, income items a)–d), total, deductions. Whole-dollar
// amounts (income floored, deductions ceiled) per IRAS rounding rules.
function drawForm(doc: jsPDF, form: Form, orgName: string, aisEmployer: boolean) {
  const M = 48 // margin
  const right = doc.internal.pageSize.getWidth() - M
  let y = 54

  const catDollars = (cat: (typeof IR8A_CATEGORIES)[number]) =>
    incomeDollars(form.incomeByCategory.find((c) => c.category === cat)?.cents ?? 0)

  // Title
  doc.setFont("helvetica", "bold").setFontSize(13)
  doc.text("FORM IR8A", M, y)
  doc.setFontSize(9.5).setFont("helvetica", "normal")
  y += 14
  doc.text(
    `Return of Employee's Remuneration for the Year Ended 31 Dec ${form.year}`,
    M,
    y,
  )
  y += 12
  doc.setFontSize(8).setTextColor(110)
  doc.text(
    `Give this form to your employee by 1 Mar ${Number(form.year) + 1}.`,
    M,
    y,
  )
  doc.setTextColor(0)
  y += 16

  // AIS retention statement (only for AIS-registered employers).
  if (aisEmployer) {
    doc.setFontSize(7.5).setTextColor(90)
    const lines = doc.splitTextToSize(AIS_STATEMENT, right - M)
    doc.text(lines, M, y)
    y += lines.length * 9 + 8
    doc.setTextColor(0)
  }

  // ── Particulars ──
  const particular = (label: string, value: string) => {
    doc.setFontSize(8).setTextColor(110).setFont("helvetica", "normal")
    doc.text(label, M, y)
    doc.setFontSize(9.5).setTextColor(0)
    doc.text(value || "—", M, y + 11)
    y += 26
  }
  const particular2 = (
    l1: string,
    v1: string,
    l2: string,
    v2: string,
  ) => {
    const col2 = M + (right - M) / 2
    doc.setFontSize(8).setTextColor(110).setFont("helvetica", "normal")
    doc.text(l1, M, y)
    doc.text(l2, col2, y)
    doc.setFontSize(9.5).setTextColor(0)
    doc.text(v1 || "—", M, y + 11)
    doc.text(v2 || "—", col2, y + 11)
    y += 26
  }

  doc.setDrawColor(210).line(M, y - 4, right, y - 4)
  y += 12
  particular2("Employer's Tax Ref. No. / UEN", "—", "Name of Employer", orgName)
  particular2(
    "Employee's Tax Ref. (NRIC / FIN)",
    form.idNumberMasked ?? "—",
    "Date of Birth",
    form.dob ?? "—",
  )
  particular("Full Name of Employee as per NRIC / FIN", form.fullName)
  particular2(
    "Designation",
    form.designation ?? "—",
    "Nationality",
    form.nationality ?? "—",
  )
  if (form.addressText) particular("Residential Address", form.addressText)
  if (form.commenceDate || form.ceaseDate) {
    particular2(
      "Date of Commencement",
      form.commenceDate ?? "—",
      "Date of Cessation",
      form.ceaseDate ?? "—",
    )
  }

  // ── Income ──
  const item = (label: string, dollars: number, opts?: { bold?: boolean; indent?: number }) => {
    doc.setFont("helvetica", opts?.bold ? "bold" : "normal").setFontSize(9)
    doc.text(label, M + (opts?.indent ?? 0), y, { maxWidth: right - M - 90 })
    doc.text(`$${money(dollars)}`, right, y, { align: "right" })
    y += 15
  }

  y += 6
  doc.setDrawColor(160).line(M, y - 4, right, y - 4)
  y += 12
  doc.setFont("helvetica", "bold").setFontSize(10).text("INCOME", M, y)
  y += 16

  item("a)  Gross Salary, Fees, Leave Pay, Wages and Overtime Pay", catDollars("grossSalary"))
  item("b)  Bonus", catDollars("bonus"))
  item("c)  Director's fees", catDollars("directorsFee"))
  doc.setFont("helvetica", "normal").setFontSize(9).text("d)  Others:", M, y)
  y += 14
  item("1.  Allowances", catDollars("allowancesTaxable"), { indent: 16 })
  item("2.  Gross Commission", catDollars("commission"), { indent: 16 })
  item("3.  Lump sum payment (Gratuity / Notice Pay / Ex-gratia)", catDollars("gratuityExGratia"), { indent: 16 })
  if (catDollars("otherIncome") > 0) {
    item("4.  Other income", catDollars("otherIncome"), { indent: 16 })
  }

  const totalIncome = IR8A_CATEGORIES.reduce((n, c) => n + catDollars(c), 0)
  y += 2
  doc.setDrawColor(160).line(M, y - 4, right, y - 4)
  y += 10
  item("Total of items a) to d)", totalIncome, { bold: true })

  // ── Deductions ──
  y += 8
  doc.setFont("helvetica", "bold").setFontSize(10).text("DEDUCTIONS", M, y)
  y += 16
  item(
    "Employee's compulsory contribution to CPF",
    deductionDollars(form.employeeCpfCents),
  )

  // ── Declaration ──
  y += 16
  doc.setDrawColor(210).line(M, y - 4, right, y - 4)
  y += 12
  doc.setFontSize(8).setTextColor(110).setFont("helvetica", "normal")
  doc.text("Name of Employer", M, y)
  doc.setFontSize(9.5).setTextColor(0).text(orgName || "—", M, y + 11)
  y += 30

  doc.setFontSize(7.5).setTextColor(120)
  doc.text(
    "Amounts shown to the nearest dollar (income rounded down, deductions rounded up) per IRAS rules.",
    M,
    y,
    { maxWidth: right - M },
  )
  doc.setTextColor(0)
}

// Generate + download a single employee's IR8A form PDF.
export function downloadIr8aPdf(
  form: Form,
  orgName: string,
  aisEmployer: boolean,
) {
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  drawForm(doc, form, orgName, aisEmployer)
  doc.save(`IR8A ${form.year} - ${safeName(form.fullName)}.pdf`)
}

// Generate all forms as individual PDFs, bundled into a single zip.
export function downloadAllIr8aPdfs(
  forms: Form[],
  orgName: string,
  year: string,
  aisEmployer: boolean,
) {
  const entries: ZipEntry[] = []
  for (const form of forms) {
    const doc = new jsPDF({ unit: "pt", format: "a4" })
    drawForm(doc, form, orgName, aisEmployer)
    entries.push({
      name: `IR8A ${year} - ${safeName(form.fullName)}.pdf`,
      data: doc.output("arraybuffer"),
    })
  }
  const blob = createZip(entries)
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `IR8A ${year}.zip`
  a.click()
  URL.revokeObjectURL(url)
}
