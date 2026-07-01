/**
 * Client-side tabular export helpers for the Report builder. CSV is emitted
 * natively; "Excel" uses a SpreadsheetML-flavoured HTML table saved as `.xls`,
 * which Excel and Sheets open without needing a heavyweight dependency.
 */

export type Cell = string | number | null

function csvEscape(v: Cell): string {
  const s = v == null ? "" : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  return [headers, ...rows]
    .map((r) => r.map(csvEscape).join(","))
    .join("\r\n")
}

function htmlEscape(v: Cell): string {
  const s = v == null ? "" : String(v)
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

/** An HTML-table workbook Excel opens natively (saved with an .xls extension). */
export function toExcelHtml(
  title: string,
  headers: string[],
  rows: Cell[][],
): string {
  const head = headers.map((h) => `<th>${htmlEscape(h)}</th>`).join("")
  const body = rows
    .map(
      (r) => `<tr>${r.map((c) => `<td>${htmlEscape(c)}</td>`).join("")}</tr>`,
    )
    .join("")
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${htmlEscape(
    title,
  )}</title></head><body><table border="1"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`
}

export function downloadFile(
  filename: string,
  content: string,
  mime: string,
): void {
  if (typeof window === "undefined") return
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
