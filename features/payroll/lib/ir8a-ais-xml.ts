import type { FunctionReturnType } from "convex/server"
import type { api } from "@/convex/_generated/api"

type AisRow = FunctionReturnType<typeof api.ir8a.exportAisRows>[number]

/**
 * BEST-EFFORT IRAS AIS IR8A XML.
 *
 * The record structure and the encoding rules (whole-dollar income floored /
 * CPF ceiled, DOB as YYYYMMDD, name-as-per-NRIC, XML entity escaping, trailer
 * totals that reconcile, ID-type hierarchy) follow IRAS' published "Additional
 * specifications for TXT and XML file format" (Aug 2024). The exact ELEMENT
 * NAMES / namespace are IRAS' per-form schema, which is only in their
 * downloadable sample-XML package — so the tag names below are our best guess.
 * Validate the output in IRAS' offline Validation & Submission Application and
 * adjust the TAGS map to whatever the schema requires. Everything else
 * (values, order, formatting) is already to spec.
 */

// Central tag map — swap these to the exact IRAS schema names after validating.
const TAGS = {
  root: "IR8AForm",
  namespace: "http://www.iras.gov.sg/IR8A",
  employerUEN: "OrganisationID",
  employerName: "EmployerName",
  basisYear: "BasisYear",
  records: "Records",
  record: "IR8ARecord",
  idType: "EmployeeIDType",
  id: "EmployeeID",
  name: "EmployeeName",
  dob: "DateOfBirth",
  nationality: "Nationality",
  designation: "Designation",
  commence: "DateOfCommencement",
  cease: "DateOfCessation",
  salary: "Salary",
  bonus: "Bonus",
  directorsFees: "DirectorsFees",
  allowances: "Allowances",
  commission: "GrossCommission",
  lumpSum: "LumpSumPayment",
  otherIncome: "OtherIncome",
  grossRemuneration: "GrossRemuneration",
  employeeCPF: "EmployeeCPF",
  trailer: "Trailer",
  recordCount: "RecordCount",
  totalGross: "TotalGrossRemuneration",
  totalCPF: "TotalEmployeeCPF",
} as const

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&apos;")
    .replace(/"/g, "&quot;")
}

// ISO "YYYY-MM-DD" → "YYYYMMDD" (IRAS date format). Empty stays empty.
const isoToAis = (d: string) => d.replace(/-/g, "")

// ID-type per IRAS hierarchy, inferred from the identifier prefix.
function idType(nric: string): string {
  const c = nric.trim().charAt(0).toUpperCase()
  if (c === "S" || c === "T") return "NRIC"
  if (c === "F" || c === "G" || c === "M") return "FIN"
  return "Passport"
}

export function buildAisXml(
  rows: AisRow[],
  orgName: string,
  year: string,
): string {
  const t = TAGS
  const el = (tag: string, value: string | number) =>
    `<${tag}>${typeof value === "number" ? value : esc(value)}</${tag}>`

  const records = rows
    .map((r) => {
      const fields = [
        el(t.idType, idType(r.nric)),
        el(t.id, r.nric),
        el(t.name, r.fullName),
        el(t.dob, isoToAis(r.dob)),
        el(t.nationality, r.nationality),
        el(t.designation, r.designation),
        el(t.commence, isoToAis(r.commenceDate)),
        el(t.cease, isoToAis(r.ceaseDate)),
        el(t.salary, r.grossSalary),
        el(t.bonus, r.bonus),
        el(t.directorsFees, r.directorsFee),
        el(t.allowances, r.allowancesTaxable),
        el(t.commission, r.commission),
        el(t.lumpSum, r.gratuityExGratia),
        el(t.otherIncome, r.otherIncome),
        el(t.grossRemuneration, r.grossRemuneration),
        el(t.employeeCPF, r.employeeCpf),
      ]
      return `    <${t.record}>\n      ${fields.join("\n      ")}\n    </${t.record}>`
    })
    .join("\n")

  const totalGross = rows.reduce((n, r) => n + r.grossRemuneration, 0)
  const totalCpf = rows.reduce((n, r) => n + r.employeeCpf, 0)

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<${t.root} xmlns="${t.namespace}">`,
    `  ${el(t.employerUEN, "")}`,
    `  ${el(t.employerName, orgName)}`,
    `  ${el(t.basisYear, year)}`,
    `  <${t.records}>`,
    records,
    `  </${t.records}>`,
    `  <${t.trailer}>`,
    `    ${el(t.recordCount, rows.length)}`,
    `    ${el(t.totalGross, totalGross)}`,
    `    ${el(t.totalCPF, totalCpf)}`,
    `  </${t.trailer}>`,
    `</${t.root}>`,
  ].join("\n")
}
