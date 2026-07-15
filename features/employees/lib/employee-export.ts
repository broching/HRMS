import ExcelJS from "exceljs"
import type { FunctionReturnType } from "convex/server"
import type { api } from "@/convex/_generated/api"

export type EmployeeExportRow = FunctionReturnType<typeof api.employees.exportRows>[number]

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  probation: "Probation",
  on_leave: "On leave",
  suspended: "Suspended",
  terminated: "Inactive",
}

const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  intern: "Intern",
}

const HEADERS = [
  "Employee No",
  "First Name",
  "Last Name",
  "Preferred Name",
  "Status",
  "Employment Type",
  "Department",
  "Position",
  "Team",
  "Office",
  "Manager",
  "Join Date",
  "Confirmation Date",
  "Probation End Date",
  "Exit Date",
  "Work Email",
  "Personal Email",
  "Phone",
  "Date of Birth",
  "Gender",
  "Marital Status",
  "Nationality",
  "Address Line 1",
  "Address Line 2",
  "City",
  "State",
  "Postal Code",
  "Country",
] as const

function toCells(r: EmployeeExportRow): (string | number)[] {
  return [
    r.employeeNumber,
    r.firstName,
    r.lastName,
    r.preferredName ?? "",
    STATUS_LABEL[r.status] ?? r.status,
    EMPLOYMENT_TYPE_LABEL[r.employmentType] ?? r.employmentType,
    r.departmentName ?? "",
    r.positionTitle ?? "",
    r.teamName ?? "",
    r.officeName ?? "",
    r.managerName ?? "",
    r.joinDate,
    r.confirmationDate ?? "",
    r.probationEndDate ?? "",
    r.exitDate ?? "",
    r.workEmail ?? "",
    r.personalEmail ?? "",
    r.phone ?? "",
    r.dob ?? "",
    r.gender ?? "",
    r.maritalStatus ?? "",
    r.nationality ?? "",
    r.addressLine1 ?? "",
    r.addressLine2 ?? "",
    r.city ?? "",
    r.state ?? "",
    r.postalCode ?? "",
    r.country ?? "",
  ]
}

export async function buildEmployeesWorkbook(rows: EmployeeExportRow[]): Promise<Blob> {
  const wb = new ExcelJS.Workbook()
  wb.created = new Date()
  const ws = wb.addWorksheet("Employees")

  const headerRow = ws.addRow([...HEADERS])
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } }
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } }
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true }
  })

  for (const r of rows) ws.addRow(toCells(r))

  ws.columns.forEach((col) => {
    col.width = 16
  })
  ws.getColumn(2).width = 18
  ws.getColumn(3).width = 18
  ws.getColumn(16).width = 26
  ws.views = [{ state: "frozen", ySplit: 1 }]
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: HEADERS.length } }

  const buffer = await wb.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}

function csvField(value: string | number): string {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function buildEmployeesCsv(rows: EmployeeExportRow[]): Blob {
  const lines = [HEADERS.map(csvField).join(",")]
  for (const r of rows) lines.push(toCells(r).map(csvField).join(","))
  // BOM so Excel opens the UTF-8 CSV without mangling non-ASCII names.
  return new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" })
}

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
