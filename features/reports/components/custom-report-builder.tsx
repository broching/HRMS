"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import {
  IconArrowLeft,
  IconChartBar,
  IconChartLine,
  IconChartArea,
  IconChartPie,
  IconTable,
  IconNumbers,
  IconPlus,
  IconTrash,
  IconCopy,
  IconDots,
  IconX,
  IconDatabase,
  IconAdjustments,
  IconGripVertical,
  IconAbc,
  IconHash,
  IconCalendar,
  IconDeviceFloppy,
  type Icon,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { useEnabledModules } from "@/hooks/use-modules"
import {
  SOURCES,
  sourceByKey,
  inferFields,
  aggregationsFor,
  fieldLabel,
  COUNT_MEASURE,
  type ChartConfig,
  type ChartType,
  type Aggregation,
  type Field,
  type Row,
  type TileSize,
} from "@/features/reports/lib/custom-report"
import { CustomChart, autoChartTitle } from "./custom-chart"

const CHART_TYPES: { type: ChartType; label: string; icon: Icon }[] = [
  { type: "bar", label: "Bar", icon: IconChartBar },
  { type: "line", label: "Line", icon: IconChartLine },
  { type: "area", label: "Area", icon: IconChartArea },
  { type: "pie", label: "Pie", icon: IconChartPie },
  { type: "kpi", label: "Number", icon: IconNumbers },
  { type: "table", label: "Table", icon: IconTable },
]

const AGG_LABELS: Record<Aggregation, string> = {
  sum: "Sum",
  avg: "Average",
  count: "Count",
  min: "Minimum",
  max: "Maximum",
  count_distinct: "Distinct count",
}

const FIELD_ICON: Record<Field["type"], Icon> = {
  dimension: IconAbc,
  measure: IconHash,
  date: IconCalendar,
}

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

function newChart(): ChartConfig {
  return {
    id: makeId(),
    title: "",
    type: "bar",
    aggregation: "count",
    size: "md",
  }
}

// Smart assign for the sidebar click-to-add: measures go to Value, categorical
// fields fill Category first, then Colour.
function assignField(chart: ChartConfig, field: Field): ChartConfig {
  if (field.type === "measure") {
    return {
      ...chart,
      measure: field.key,
      aggregation: chart.aggregation === "count" ? "sum" : chart.aggregation,
    }
  }
  const gran = field.type === "date" ? ("month" as const) : undefined
  if (!chart.dimension) return { ...chart, dimension: field.key, granularity: gran }
  if (!chart.series && chart.type !== "kpi")
    return { ...chart, series: field.key }
  return { ...chart, dimension: field.key, granularity: gran }
}

type BuilderProps = { reportId: Id<"customReports"> | null }

export function CustomReportBuilder({ reportId }: BuilderProps) {
  const router = useRouter()
  const existing = useQuery(
    api.customReports.get,
    reportId ? { id: reportId } : "skip",
  )
  const enabledModules = useEnabledModules()
  const createReport = useMutation(api.customReports.create)
  const updateReport = useMutation(api.customReports.update)

  const [name, setName] = React.useState("Untitled report")
  const [dataset, setDataset] = React.useState<string>("")
  const [charts, setCharts] = React.useState<ChartConfig[]>([])
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [inspectorOpen, setInspectorOpen] = React.useState(false)
  const hydrated = React.useRef(false)

  // Available sources, gated to the org's enabled modules.
  const sources = React.useMemo(
    () =>
      SOURCES.filter((s) => !enabledModules || enabledModules.has(s.module)),
    [enabledModules],
  )

  // Hydrate from an existing report once it loads; for a new report seed a
  // sensible default source + first chart.
  React.useEffect(() => {
    if (hydrated.current) return
    if (reportId) {
      if (existing === undefined) return
      if (existing) {
        setName(existing.name)
        setDataset(existing.dataset)
        setCharts(existing.charts as ChartConfig[])
        setSelectedId(existing.charts[0]?.id ?? null)
        hydrated.current = true
      }
    } else if (sources.length > 0) {
      const first = newChart()
      setDataset(sources[0].key)
      setCharts([first])
      setSelectedId(first.id)
      hydrated.current = true
    }
  }, [existing, reportId, sources])

  const data = useQuery(
    api.reportBuilder.dataset,
    dataset ? { report: dataset } : "skip",
  )

  const fields: Field[] = React.useMemo(() => {
    if (!data) return []
    return inferFields(data.columns, data.rows as Row[])
  }, [data])

  const rows = (data?.rows as Row[]) ?? []
  const selected = charts.find((c) => c.id === selectedId) ?? null

  function patchChart(id: string, patch: Partial<ChartConfig>) {
    setCharts((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }
  function updateSelected(patch: Partial<ChartConfig>) {
    if (selected) patchChart(selected.id, patch)
  }
  function addChart() {
    const c = newChart()
    setCharts((cs) => [...cs, c])
    setSelectedId(c.id)
    setInspectorOpen(true)
  }
  function duplicateChart(id: string) {
    const src = charts.find((c) => c.id === id)
    if (!src) return
    const copy = { ...src, id: makeId(), title: src.title ? `${src.title} copy` : "" }
    setCharts((cs) => {
      const idx = cs.findIndex((c) => c.id === id)
      const next = [...cs]
      next.splice(idx + 1, 0, copy)
      return next
    })
    setSelectedId(copy.id)
  }
  function deleteChart(id: string) {
    setCharts((cs) => cs.filter((c) => c.id !== id))
    setSelectedId((cur) => (cur === id ? null : cur))
  }
  function selectChart(id: string) {
    setSelectedId(id)
    setInspectorOpen(true)
  }

  function changeSource(next: string) {
    if (next === dataset) return
    // Field keys differ across datasets, so reset the tiles to a fresh chart.
    setDataset(next)
    const c = newChart()
    setCharts([c])
    setSelectedId(c.id)
  }

  async function handleSave() {
    if (!dataset) return
    setSaving(true)
    try {
      if (reportId) {
        await updateReport({ id: reportId, name, dataset, charts })
        toast.success("Report saved")
      } else {
        const id = await createReport({ name, dataset, charts })
        toast.success("Report created")
        router.replace(`/hr-lounge/reports/custom/${id}`)
      }
    } catch {
      toast.error("Could not save the report")
    } finally {
      setSaving(false)
    }
  }

  const loading = (reportId && existing === undefined) || !hydrated.current
  if (loading) {
    return (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-[70vh] w-full" />
      </div>
    )
  }
  if (reportId && existing === null) {
    return (
      <div className="text-muted-foreground px-4 py-16 text-center text-sm lg:px-6">
        This report doesn&apos;t exist or you don&apos;t have access to it.
      </div>
    )
  }

  const fieldsPanel = (
    <FieldsPanel
      sources={sources}
      dataset={dataset}
      onChangeSource={changeSource}
      fields={fields}
      loading={data === undefined && Boolean(dataset)}
      onPickField={(f) => {
        if (selected) updateSelected(assignField(selected, f))
      }}
    />
  )

  const inspector = selected ? (
    <Inspector
      chart={selected}
      fields={fields}
      onChange={updateSelected}
    />
  ) : (
    <div className="text-muted-foreground p-4 text-sm">
      Select a chart to edit it, or add a new one.
    </div>
  )

  return (
    <div className="flex flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3 lg:px-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/hr-lounge/reports/custom")}
          aria-label="Back to reports"
        >
          <IconArrowLeft className="size-4" />
        </Button>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-9 max-w-xs border-transparent text-base font-semibold hover:border-input focus-visible:border-input"
          aria-label="Report name"
        />
        <div className="ml-auto flex items-center gap-2">
          {/* Small-screen access to the data + fields panel */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="xl:hidden">
                <IconDatabase className="size-4" />
                Data
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 p-0">
              {fieldsPanel}
            </SheetContent>
          </Sheet>
          <Button size="sm" onClick={handleSave} disabled={saving || !dataset}>
            <IconDeviceFloppy className="size-4" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <div className="flex min-h-[70vh]">
        {/* Fields rail (desktop) */}
        <aside className="hidden w-64 shrink-0 border-r xl:block">
          {fieldsPanel}
        </aside>

        {/* Dashboard canvas */}
        <div className="min-w-0 flex-1 bg-muted/30 p-4 lg:p-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-muted-foreground text-sm">
              {charts.length} chart{charts.length === 1 ? "" : "s"}
            </p>
            <Button variant="outline" size="sm" onClick={addChart}>
              <IconPlus className="size-4" />
              Add chart
            </Button>
          </div>

          {charts.length === 0 ? (
            <button
              type="button"
              onClick={addChart}
              className="border-muted-foreground/25 text-muted-foreground hover:border-primary hover:text-foreground flex h-64 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors"
            >
              <IconPlus className="size-6" />
              <span className="text-sm font-medium">Add your first chart</span>
            </button>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {charts.map((c) => (
                <ChartTile
                  key={c.id}
                  chart={c}
                  fields={fields}
                  rows={rows}
                  selected={c.id === selectedId}
                  onSelect={() => selectChart(c.id)}
                  onEdit={() => selectChart(c.id)}
                  onDuplicate={() => duplicateChart(c.id)}
                  onDelete={() => deleteChart(c.id)}
                  onResize={(size) => patchChart(c.id, { size })}
                />
              ))}
            </div>
          )}
        </div>

        {/* Inspector (desktop) */}
        <aside className="hidden w-80 shrink-0 border-l xl:block">
          <div className="border-b px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <IconAdjustments className="size-4" />
              Chart settings
            </p>
          </div>
          {inspector}
        </aside>
      </div>

      {/* Inspector (mobile/tablet) */}
      <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-sm xl:hidden">
          <div className="border-b px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <IconAdjustments className="size-4" />
              Chart settings
            </p>
          </div>
          {inspector}
        </SheetContent>
      </Sheet>
    </div>
  )
}

// ─── Fields rail ─────────────────────────────────────────────────────────────

function FieldsPanel({
  sources,
  dataset,
  onChangeSource,
  fields,
  loading,
  onPickField,
}: {
  sources: typeof SOURCES
  dataset: string
  onChangeSource: (v: string) => void
  fields: Field[]
  loading: boolean
  onPickField: (f: Field) => void
}) {
  const dimensions = fields.filter((f) => f.type !== "measure")
  const measures = fields.filter((f) => f.type === "measure")
  const source = sourceByKey(dataset)

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b p-4">
        <Label className="text-muted-foreground text-xs font-semibold uppercase">
          Data source
        </Label>
        <Select value={dataset} onValueChange={onChangeSource}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose a dataset" />
          </SelectTrigger>
          <SelectContent>
            {sources.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {source && (
          <p className="text-muted-foreground text-xs">{source.description}</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        ) : (
          <div className="space-y-5">
            <FieldGroup
              title="Dimensions"
              hint="Group by"
              fields={dimensions}
              onPick={onPickField}
            />
            <FieldGroup
              title="Measures"
              hint="Values to aggregate"
              fields={measures}
              onPick={onPickField}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function FieldGroup({
  title,
  hint,
  fields,
  onPick,
}: {
  title: string
  hint: string
  fields: Field[]
  onPick: (f: Field) => void
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-muted-foreground text-xs font-semibold uppercase">
          {title}
        </p>
        <span className="text-muted-foreground/70 text-[11px]">{hint}</span>
      </div>
      <div className="flex flex-col gap-1">
        {fields.length === 0 && (
          <p className="text-muted-foreground text-xs">None</p>
        )}
        {fields.map((f) => {
          const FIcon = FIELD_ICON[f.type]
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => onPick(f)}
              title={`Add ${f.label}`}
              className="group hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors"
            >
              <IconGripVertical className="text-muted-foreground/40 size-3.5 shrink-0" />
              <FIcon
                className={cn(
                  "size-4 shrink-0",
                  f.type === "measure" ? "text-emerald-600" : "text-blue-600",
                )}
              />
              <span className="truncate">{f.label}</span>
              <IconPlus className="text-muted-foreground ml-auto size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Inspector ───────────────────────────────────────────────────────────────

function Inspector({
  chart,
  fields,
  onChange,
}: {
  chart: ChartConfig
  fields: Field[]
  onChange: (patch: Partial<ChartConfig>) => void
}) {
  const dimensionFields = fields.filter((f) => f.type !== "measure")
  const measureFields = fields.filter((f) => f.type === "measure")
  const dimIsDate =
    fields.find((f) => f.key === chart.dimension)?.type === "date"
  const aggOptions = aggregationsFor(chart.measure)
  const isCategory = chart.type !== "kpi"

  return (
    <div className="space-y-5 overflow-y-auto p-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Title</Label>
        <Input
          value={chart.title}
          placeholder={autoChartTitle(chart, fields)}
          onChange={(e) => onChange({ title: e.target.value })}
          className="h-9"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Chart type</Label>
        <div className="grid grid-cols-6 gap-1">
          {CHART_TYPES.map((t) => (
            <button
              key={t.type}
              type="button"
              onClick={() => onChange({ type: t.type })}
              title={t.label}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md border py-2 text-[10px] transition-colors",
                chart.type === t.type
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent border-transparent",
              )}
            >
              <t.icon className="size-4" />
            </button>
          ))}
        </div>
      </div>

      <Separator />

      {isCategory && (
        <Shelf
          label="Category"
          hint="X axis / grouping"
          valueLabel={fieldLabel(fields, chart.dimension)}
          options={dimensionFields.map((f) => ({ key: f.key, label: f.label }))}
          onSelect={(key) => {
            const isDate =
              fields.find((f) => f.key === key)?.type === "date"
            onChange({ dimension: key, granularity: isDate ? "month" : undefined })
          }}
          onClear={() => onChange({ dimension: undefined, granularity: undefined })}
        />
      )}

      {isCategory && dimIsDate && (
        <div className="space-y-1.5">
          <Label className="text-xs">Date grouping</Label>
          <Select
            value={chart.granularity ?? "month"}
            onValueChange={(v) =>
              onChange({ granularity: v as ChartConfig["granularity"] })
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Day</SelectItem>
              <SelectItem value="month">Month</SelectItem>
              <SelectItem value="year">Year</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <Shelf
        label="Value"
        hint="What to measure"
        valueLabel={
          chart.measure
            ? fieldLabel(fields, chart.measure)
            : "Number of records"
        }
        options={[
          { key: COUNT_MEASURE, label: "Number of records" },
          ...measureFields.map((f) => ({ key: f.key, label: f.label })),
        ]}
        onSelect={(key) => {
          if (key === COUNT_MEASURE)
            onChange({ measure: undefined, aggregation: "count" })
          else
            onChange({
              measure: key,
              aggregation:
                chart.aggregation === "count" ? "sum" : chart.aggregation,
            })
        }}
        // Value always has a meaning (records), so no clear.
      />

      {chart.measure && (
        <div className="space-y-1.5">
          <Label className="text-xs">Aggregation</Label>
          <Select
            value={chart.aggregation}
            onValueChange={(v) => onChange({ aggregation: v as Aggregation })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {aggOptions.map((a) => (
                <SelectItem key={a} value={a}>
                  {AGG_LABELS[a]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {isCategory && chart.type !== "pie" && (
        <Shelf
          label="Colour"
          hint="Split into series"
          valueLabel={fieldLabel(fields, chart.series)}
          options={dimensionFields
            .filter((f) => f.key !== chart.dimension)
            .map((f) => ({ key: f.key, label: f.label }))}
          onSelect={(key) => onChange({ series: key })}
          onClear={() => onChange({ series: undefined })}
        />
      )}

      {isCategory && (
        <>
          <Separator />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Sort</Label>
              <Select
                value={chart.sort ?? "value_desc"}
                onValueChange={(v) =>
                  onChange({ sort: v as ChartConfig["sort"] })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="value_desc">Value ↓</SelectItem>
                  <SelectItem value="value_asc">Value ↑</SelectItem>
                  <SelectItem value="label_asc">Label A–Z</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Show top</Label>
              <Select
                value={chart.limit ? String(chart.limit) : "all"}
                onValueChange={(v) =>
                  onChange({ limit: v === "all" ? undefined : Number(v) })
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="5">Top 5</SelectItem>
                  <SelectItem value="10">Top 10</SelectItem>
                  <SelectItem value="20">Top 20</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Shelf({
  label,
  hint,
  valueLabel,
  options,
  onSelect,
  onClear,
}: {
  label: string
  hint: string
  valueLabel: string | undefined
  options: { key: string; label: string }[]
  onSelect: (key: string) => void
  onClear?: () => void
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="text-muted-foreground/70 text-[11px]">{hint}</span>
      </div>
      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex h-9 flex-1 items-center gap-2 rounded-md border px-3 text-left text-sm transition-colors",
                valueLabel
                  ? "border-input bg-background"
                  : "border-dashed text-muted-foreground hover:border-input",
              )}
            >
              <span className="truncate">
                {valueLabel ?? `Add ${label.toLowerCase()}`}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
            <DropdownMenuLabel>{label}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {options.length === 0 && (
              <DropdownMenuItem disabled>No fields available</DropdownMenuItem>
            )}
            {options.map((o) => (
              <DropdownMenuItem key={o.key} onClick={() => onSelect(o.key)}>
                {o.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {onClear && valueLabel && (
          <Button
            variant="ghost"
            size="icon"
            className="size-9 shrink-0"
            onClick={onClear}
            aria-label={`Clear ${label}`}
          >
            <IconX className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Dashboard tile ──────────────────────────────────────────────────────────

function ChartTile({
  chart,
  fields,
  rows,
  selected,
  onSelect,
  onEdit,
  onDuplicate,
  onDelete,
  onResize,
}: {
  chart: ChartConfig
  fields: Field[]
  rows: Row[]
  selected: boolean
  onSelect: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  onResize: (size: TileSize) => void
}) {
  return (
    <Card
      onClick={onSelect}
      className={cn(
        "flex cursor-pointer flex-col gap-0 overflow-hidden py-0 transition-shadow",
        chart.size === "lg" && "lg:col-span-2",
        selected ? "ring-primary ring-2" : "hover:shadow-md",
      )}
    >
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <p className="truncate text-sm font-medium">
          {autoChartTitle(chart, fields)}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto size-7 shrink-0"
              onClick={(e) => e.stopPropagation()}
              aria-label="Chart actions"
            >
              <IconDots className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenuItem onClick={onEdit}>
              <IconAdjustments className="size-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>
              <IconCopy className="size-4" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              Width
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onResize("md")}>
              Half width
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onResize("lg")}>
              Full width
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={onDelete}
            >
              <IconTrash className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <CardContent className="p-3">
        <CustomChart config={chart} fields={fields} rows={rows} height={240} />
      </CardContent>
    </Card>
  )
}
