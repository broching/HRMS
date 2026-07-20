import type { ModuleKey } from "@/convex/lib/modules"

/**
 * Client-side engine for the custom (Tableau-style) report builder. A report is
 * a small dashboard of chart tiles built over one of the report-builder
 * datasets. The dataset rows are fetched once via `api.reportBuilder.dataset`;
 * everything here — field classification and aggregation — runs in the browser
 * so the builder previews update instantly as you drag fields onto shelves.
 */

export type Cell = string | number | null
export type Row = Record<string, Cell>
export type DatasetColumn = { key: string; label: string; group: string }

export type ChartType = "bar" | "line" | "area" | "pie" | "kpi" | "table"
export type Aggregation =
  | "sum"
  | "avg"
  | "count"
  | "min"
  | "max"
  | "count_distinct"
export type Granularity = "day" | "month" | "year"
export type TileSize = "sm" | "md" | "lg"
export type ChartSort = "value_desc" | "value_asc" | "label_asc"

export type ChartConfig = {
  id: string
  title: string
  type: ChartType
  /** Categorical or date field for the X axis / category. Absent for a KPI. */
  dimension?: string
  /** Numeric field to aggregate. Absent = count of records. */
  measure?: string
  /** Second categorical field for colour/series breakdown. */
  series?: string
  aggregation: Aggregation
  granularity?: Granularity
  sort?: ChartSort
  limit?: number
  size?: TileSize
}

// ─── Data sources ────────────────────────────────────────────────────────────

/**
 * The report-builder datasets that make good "fact tables" to pivot on. Each
 * maps to a `convex/reportBuilder.ts` dataset (whose permission gating we
 * inherit) and to the product module that must be enabled to offer it.
 */
export type SourceDef = {
  key: string
  label: string
  description: string
  module: ModuleKey
}

export const SOURCES: SourceDef[] = [
  {
    key: "employee_information",
    label: "Employees",
    description: "One row per employee — demographics and employment details.",
    module: "core",
  },
  {
    key: "leave_records",
    label: "Leave records",
    description: "One row per leave request taken.",
    module: "leave",
  },
  {
    key: "expense_claims",
    label: "Expense claims",
    description: "One row per submitted expense claim.",
    module: "claims",
  },
  {
    key: "employee_payroll",
    label: "Payroll",
    description: "One row per payslip across all runs.",
    module: "payroll",
  },
  {
    key: "timesheet_employee",
    label: "Timesheets",
    description: "One row per logged time entry.",
    module: "timesheets",
  },
  {
    key: "performance_management",
    label: "Performance reviews",
    description: "One row per appraisal review.",
    module: "performance",
  },
  {
    key: "identity_documents",
    label: "Identity documents",
    description: "One row per identity or work-pass document.",
    module: "core",
  },
]

export function sourceByKey(key: string): SourceDef | undefined {
  return SOURCES.find((s) => s.key === key)
}

// ─── Field classification ──────────────────────────────────────────────────

export type FieldType = "dimension" | "measure" | "date"
export type Field = {
  key: string
  label: string
  type: FieldType
  group: string
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}/

/**
 * Classify each dataset column as a measure (numeric), a date, or a dimension
 * (everything else) by sampling its values — the same auto-typing Tableau does
 * when it splits fields into measures and dimensions.
 */
export function inferFields(columns: DatasetColumn[], rows: Row[]): Field[] {
  return columns.map((c) => {
    let saw = false
    let allNumber = true
    let allDate = true
    for (const r of rows) {
      const val = r[c.key]
      if (val == null || val === "") continue
      saw = true
      if (typeof val !== "number") allNumber = false
      if (!(typeof val === "string" && DATE_RE.test(val))) allDate = false
      if (!allNumber && !allDate) break
    }
    let type: FieldType = "dimension"
    if (saw && allNumber) type = "measure"
    else if (saw && allDate) type = "date"
    return { key: c.key, label: c.label, type, group: c.group }
  })
}

/** Sentinel used by the Value shelf to mean "count of records" (measure = none). */
export const COUNT_MEASURE = "__count__"

// ─── Aggregation ───────────────────────────────────────────────────────────

export type CategoryChartData = {
  kind: "category"
  seriesKeys: string[]
  rows: Array<Record<string, string | number>>
}
export type KpiChartData = { kind: "kpi"; value: number }
export type TableChartData = {
  kind: "table"
  columns: string[]
  rows: Array<Array<string | number>>
}
export type ComputedChart = CategoryChartData | KpiChartData | TableChartData

function round(n: number): number {
  return Math.round(n * 100) / 100
}

function bucketLabel(v: Cell, granularity: Granularity | undefined): string {
  if (v == null || v === "") return "—"
  const s = String(v)
  if (granularity && DATE_RE.test(s)) {
    if (granularity === "year") return s.slice(0, 4)
    if (granularity === "month") return s.slice(0, 7)
    return s.slice(0, 10)
  }
  return s
}

/** Aggregate a group of rows down to a single number. */
function aggregate(
  group: Row[],
  measure: string | undefined,
  agg: Aggregation,
): number {
  if (agg === "count" || !measure) return group.length
  if (agg === "count_distinct") {
    const seen = new Set<Cell>()
    for (const r of group) {
      const val = r[measure]
      if (val != null && val !== "") seen.add(val)
    }
    return seen.size
  }
  const nums: number[] = []
  for (const r of group) {
    const val = r[measure]
    if (typeof val === "number" && Number.isFinite(val)) nums.push(val)
  }
  if (nums.length === 0) return 0
  if (agg === "sum") return round(nums.reduce((a, b) => a + b, 0))
  if (agg === "avg")
    return round(nums.reduce((a, b) => a + b, 0) / nums.length)
  if (agg === "min") return round(Math.min(...nums))
  return round(Math.max(...nums)) // max
}

function isDateField(fields: Field[], key: string | undefined): boolean {
  if (!key) return false
  return fields.find((f) => f.key === key)?.type === "date"
}

function sortCategories(
  entries: Array<{ label: string; total: number }>,
  sort: ChartSort | undefined,
  dateDimension: boolean,
): string[] {
  const arr = [...entries]
  const mode = sort ?? (dateDimension ? "label_asc" : "value_desc")
  if (mode === "label_asc")
    arr.sort((a, b) => a.label.localeCompare(b.label))
  else if (mode === "value_asc") arr.sort((a, b) => a.total - b.total)
  else arr.sort((a, b) => b.total - a.total) // value_desc
  return arr.map((e) => e.label)
}

/**
 * Compute a chart's display data from the raw dataset rows. Returns a
 * discriminated union the renderer switches on. Pure — no side effects — so it
 * memoizes cleanly in the preview.
 */
export function computeChart(
  config: ChartConfig,
  fields: Field[],
  rows: Row[],
): ComputedChart {
  const measure = config.measure
  const agg = config.aggregation

  // KPI: a single aggregate across every row.
  if (config.type === "kpi") {
    return { kind: "kpi", value: aggregate(rows, measure, agg) }
  }

  const dateDim = isDateField(fields, config.dimension)
  const gran = dateDim ? (config.granularity ?? "month") : undefined

  // Group rows by category (and series, if set).
  const byCategory = new Map<string, Map<string, Row[]>>()
  const seriesSet = new Set<string>()
  for (const r of rows) {
    const cat = config.dimension
      ? bucketLabel(r[config.dimension], gran)
      : "All"
    const ser = config.series ? bucketLabel(r[config.series], undefined) : "value"
    seriesSet.add(ser)
    let inner = byCategory.get(cat)
    if (!inner) {
      inner = new Map()
      byCategory.set(cat, inner)
    }
    const bucket = inner.get(ser)
    if (bucket) bucket.push(r)
    else inner.set(ser, [r])
  }

  const hasSeries = Boolean(config.series)
  const seriesKeys = hasSeries
    ? [...seriesSet].sort((a, b) => a.localeCompare(b))
    : ["value"]

  // Aggregate every (category × series) cell, and track category totals for sort.
  const catEntries: Array<{ label: string; total: number }> = []
  const cellByCat = new Map<string, Record<string, number>>()
  for (const [cat, inner] of byCategory) {
    const cells: Record<string, number> = {}
    let total = 0
    for (const sk of seriesKeys) {
      const group = inner.get(sk) ?? []
      const val = aggregate(group, measure, agg)
      cells[sk] = val
      total += val
    }
    cellByCat.set(cat, cells)
    catEntries.push({ label: cat, total })
  }

  let orderedCats = sortCategories(catEntries, config.sort, dateDim)
  if (config.limit && config.limit > 0)
    orderedCats = orderedCats.slice(0, config.limit)

  if (config.type === "table") {
    const columns = [
      fieldLabel(fields, config.dimension) ?? "Category",
      ...(hasSeries ? seriesKeys : [valueColumnLabel(config, fields)]),
    ]
    const tableRows = orderedCats.map((cat) => {
      const cells = cellByCat.get(cat) ?? {}
      return [
        cat,
        ...(hasSeries
          ? seriesKeys.map((sk) => cells[sk] ?? 0)
          : [cells["value"] ?? 0]),
      ]
    })
    return { kind: "table", columns, rows: tableRows }
  }

  const dataRows = orderedCats.map((cat) => {
    const cells = cellByCat.get(cat) ?? {}
    const row: Record<string, string | number> = { category: cat }
    for (const sk of seriesKeys) row[sk] = cells[sk] ?? 0
    return row
  })
  return { kind: "category", seriesKeys, rows: dataRows }
}

export function fieldLabel(
  fields: Field[],
  key: string | undefined,
): string | undefined {
  if (!key) return undefined
  return fields.find((f) => f.key === key)?.label
}

/** Human label for the aggregated value, e.g. "Sum of Amount" or "Records". */
export function valueColumnLabel(config: ChartConfig, fields: Field[]): string {
  if (!config.measure || config.aggregation === "count") return "Records"
  const label = fieldLabel(fields, config.measure) ?? "Value"
  const verb: Record<Aggregation, string> = {
    sum: "Sum of",
    avg: "Average",
    count: "Count of",
    min: "Min",
    max: "Max",
    count_distinct: "Distinct",
  }
  return `${verb[config.aggregation]} ${label}`
}

/** Aggregations valid for the current measure choice. */
export function aggregationsFor(measure: string | undefined): Aggregation[] {
  if (!measure) return ["count"]
  return ["sum", "avg", "min", "max", "count", "count_distinct"]
}

// A shared, colour-blind-considerate palette, matching the Statistics view.
export const CHART_PALETTE = [
  "#f59e0b",
  "#8b5cf6",
  "#3b82f6",
  "#ef4444",
  "#10b981",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#6366f1",
  "#84cc16",
]
