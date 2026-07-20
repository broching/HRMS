"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import {
  IconAdjustmentsHorizontal,
  IconDownload,
  IconFilter,
  IconX,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  toCsv,
  toExcelHtml,
  downloadFile,
  type Cell,
} from "@/features/reports/lib/export"

type Column = { key: string; label: string; group: string }
type Row = Record<string, Cell>

function cellText(v: Cell): string {
  if (v == null) return "—"
  if (typeof v === "number")
    return Number.isInteger(v) ? String(v) : v.toLocaleString()
  return v
}

const MONTH_NAMES = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleString("en", { month: "long" }),
)
// A short window of years around now for the year picker.
const YEAR_OPTIONS = (() => {
  const now = new Date().getFullYear()
  return Array.from({ length: 6 }, (_, i) => now - i)
})()

export function ReportBuilderDetail({
  reportKey,
  title,
  dateFilter = false,
}: {
  reportKey: string
  title: string
  dateFilter?: boolean
}) {
  // Date scope for date-filterable reports. Default to the current year, all
  // months ("all"). Ignored entirely when `dateFilter` is false.
  const [year, setYear] = React.useState(new Date().getFullYear())
  const [month, setMonth] = React.useState<string>("all")

  const data = useQuery(
    api.reportBuilder.dataset,
    dateFilter
      ? {
          report: reportKey,
          year,
          month: month === "all" ? undefined : Number(month),
        }
      : { report: reportKey },
  )

  const [visible, setVisible] = React.useState<Record<string, boolean>>({})
  const [filters, setFilters] = React.useState<Record<string, string>>({})
  const [search, setSearch] = React.useState("")
  const initialised = React.useRef(false)

  // Keep the last successful dataset so switching the date scope doesn't blank
  // the table/filters while the new query is in flight.
  const lastData = React.useRef<typeof data>(undefined)
  if (data !== undefined) lastData.current = data
  const effective = data === undefined ? lastData.current : data
  const refetching = data === undefined && lastData.current != null

  // Default every column to visible once the dataset arrives.
  React.useEffect(() => {
    if (data && !initialised.current) {
      const init: Record<string, boolean> = {}
      for (const c of data.columns) init[c.key] = true
      setVisible(init)
      initialised.current = true
    }
  }, [data])

  if (effective === undefined) {
    return <Skeleton className="h-96 w-full" />
  }
  if (effective === null) {
    return (
      <p className="text-muted-foreground py-10 text-sm">
        You don&apos;t have access to this report, or it has no data.
      </p>
    )
  }

  const columns = effective.columns as Column[]
  const rows = effective.rows as Row[]
  const visibleColumns = columns.filter((c) => visible[c.key] !== false)

  const activeFilters = Object.entries(filters).filter(
    ([, val]) => val.trim() !== "",
  )

  const filtered = rows.filter((row) => {
    if (search.trim()) {
      const hay = columns
        .map((c) => cellText(row[c.key]))
        .join(" ")
        .toLowerCase()
      if (!hay.includes(search.trim().toLowerCase())) return false
    }
    for (const [key, val] of activeFilters) {
      if (!cellText(row[key]).toLowerCase().includes(val.trim().toLowerCase()))
        return false
    }
    return true
  })

  function buildMatrix(): { headers: string[]; body: Cell[][] } {
    const headers = visibleColumns.map((c) => c.label)
    const body = filtered.map((row) => visibleColumns.map((c) => row[c.key]))
    return { headers, body }
  }

  function exportCsv() {
    const { headers, body } = buildMatrix()
    downloadFile(
      `${reportKey}.csv`,
      toCsv(headers, body),
      "text/csv;charset=utf-8",
    )
  }

  function exportExcel() {
    const { headers, body } = buildMatrix()
    downloadFile(
      `${reportKey}.xls`,
      toExcelHtml(title, headers, body),
      "application/vnd.ms-excel",
    )
  }

  // Column definitions grouped for the Fields & Filters panel.
  const groups: { group: string; cols: Column[] }[] = []
  for (const c of columns) {
    const g = groups.find((x) => x.group === c.group)
    if (g) g.cols.push(c)
    else groups.push({ group: c.group, cols: [c] })
  }

  function toggleColumn(key: string) {
    setVisible((prev) => ({ ...prev, [key]: prev[key] === false }))
  }
  function addFilter(key: string) {
    setFilters((prev) => (key in prev ? prev : { ...prev, [key]: "" }))
  }
  function setFilterValue(key: string, val: string) {
    setFilters((prev) => ({ ...prev, [key]: val }))
  }
  function removeFilter(key: string) {
    setFilters((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          Use the Fields &amp; Filters panel to craft the report the way you want
          to see it.
        </p>
        <div className="flex items-center gap-2">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline">
                <IconAdjustmentsHorizontal className="size-4" />
                Fields &amp; Filters
              </Button>
            </SheetTrigger>
            <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Fields &amp; Filters</SheetTitle>
                <SheetDescription>
                  Use the checkboxes to include or exclude columns. Use “Add
                  filter” to narrow the report.
                </SheetDescription>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-4">
                {groups.map((g) => (
                  <div key={g.group} className="py-3">
                    <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
                      {g.group}
                    </p>
                    <div className="flex flex-col gap-2">
                      {g.cols.map((c) => (
                        <div key={c.key} className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <label className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={visible[c.key] !== false}
                                onCheckedChange={() => toggleColumn(c.key)}
                              />
                              {c.label}
                            </label>
                            {!(c.key in filters) && (
                              <button
                                type="button"
                                onClick={() => addFilter(c.key)}
                                className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                              >
                                <IconFilter className="size-3" />
                                Add filter
                              </button>
                            )}
                          </div>
                          {c.key in filters && (
                            <div className="flex items-center gap-2 pl-6">
                              <Input
                                value={filters[c.key]}
                                placeholder={`Filter by ${c.label.toLowerCase()}`}
                                onChange={(e) =>
                                  setFilterValue(c.key, e.target.value)
                                }
                                className="h-8"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 shrink-0"
                                onClick={() => removeFilter(c.key)}
                                aria-label="Remove filter"
                              >
                                <IconX className="size-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <SheetFooter>
                <SheetClose asChild>
                  <Button>Apply changes</Button>
                </SheetClose>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button>
                <IconDownload className="size-4" />
                Export Report
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={exportCsv}>
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportExcel}>
                Export as Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-64"
              />
              {dateFilter && (
                <div className="flex items-center gap-2">
                  <Label className="text-muted-foreground sr-only">Period</Label>
                  <Select
                    value={month}
                    onValueChange={(v) => setMonth(v)}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All months</SelectItem>
                      {MONTH_NAMES.map((name, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={String(year)}
                    onValueChange={(v) => setYear(Number(v))}
                  >
                    <SelectTrigger className="w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {YEAR_OPTIONS.map((y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <p className="text-muted-foreground text-sm">
              {refetching ? "Loading…" : `Displaying ${filtered.length} item(s)`}
            </p>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {visibleColumns.map((c) => (
                    <TableHead key={c.key} className="whitespace-nowrap">
                      {c.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row, i) => (
                  <TableRow key={i}>
                    {visibleColumns.map((c) => (
                      <TableCell key={c.key} className="whitespace-nowrap">
                        {cellText(row[c.key])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={Math.max(visibleColumns.length, 1)}
                      className="text-muted-foreground py-10 text-center"
                    >
                      No records match your filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
