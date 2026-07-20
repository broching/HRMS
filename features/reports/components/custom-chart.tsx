"use client"

import * as React from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig as UiChartConfig,
} from "@/components/ui/chart"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  computeChart,
  valueColumnLabel,
  fieldLabel,
  CHART_PALETTE,
  type ChartConfig,
  type Field,
  type Row,
} from "@/features/reports/lib/custom-report"

function fmt(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })
}

function Empty({ label }: { label: string }) {
  return (
    <div className="text-muted-foreground flex h-full min-h-40 items-center justify-center px-4 text-center text-sm">
      {label}
    </div>
  )
}

// Fixes the chart height explicitly (ChartContainer defaults to aspect-video),
// letting the ResponsiveContainer inside fill it.
function Frame({
  height,
  config,
  children,
}: {
  height: number
  config: UiChartConfig
  children: React.ComponentProps<typeof ChartContainer>["children"]
}) {
  return (
    <div style={{ height }} className="w-full">
      <ChartContainer config={config} className="h-full w-full">
        {children}
      </ChartContainer>
    </div>
  )
}

/**
 * Renders a single custom-report chart tile from its config and the source
 * dataset rows. Aggregation happens here (memoized) via `computeChart`, so the
 * same component powers both the live builder preview and saved dashboards.
 */
export function CustomChart({
  config,
  fields,
  rows,
  height = 260,
}: {
  config: ChartConfig
  fields: Field[]
  rows: Row[]
  height?: number
}) {
  const computed = React.useMemo(
    () => computeChart(config, fields, rows),
    [config, fields, rows],
  )

  // Guard against half-configured tiles so the builder never renders a broken
  // chart while you're still assigning fields.
  const needsDimension = config.type !== "kpi"
  const measureConfigured =
    config.aggregation === "count" || Boolean(config.measure)
  if (needsDimension && !config.dimension && !measureConfigured) {
    return <Empty label="Add a field to the Category and Value shelves to build this chart." />
  }

  const seriesColor = (i: number) => CHART_PALETTE[i % CHART_PALETTE.length]
  const valueLabel = valueColumnLabel(config, fields)

  if (computed.kind === "kpi") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 py-6">
        <div className="text-4xl font-semibold tracking-tight tabular-nums">
          {fmt(computed.value)}
        </div>
        <div className="text-muted-foreground text-sm">{valueLabel}</div>
      </div>
    )
  }

  if (computed.kind === "table") {
    if (computed.rows.length === 0) return <Empty label="No data for this selection." />
    return (
      <div className="max-h-[420px] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {computed.columns.map((c, i) => (
                <TableHead
                  key={c}
                  className={i === 0 ? "" : "text-right whitespace-nowrap"}
                >
                  {c}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {computed.rows.map((r, ri) => (
              <TableRow key={ri}>
                {r.map((cell, ci) => (
                  <TableCell
                    key={ci}
                    className={
                      ci === 0
                        ? "font-medium"
                        : "text-right tabular-nums whitespace-nowrap"
                    }
                  >
                    {typeof cell === "number" ? fmt(cell) : cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )
  }

  // Category charts (bar / line / area / pie).
  if (computed.rows.length === 0) return <Empty label="No data for this selection." />

  const { seriesKeys, rows: data } = computed
  const hasSeries = !(seriesKeys.length === 1 && seriesKeys[0] === "value")

  const uiConfig: UiChartConfig = {}
  seriesKeys.forEach((sk, i) => {
    uiConfig[sk] = {
      label: sk === "value" ? valueLabel : sk,
      color: seriesColor(i),
    }
  })

  if (config.type === "pie") {
    // Pie shows one slice per category; collapse any series into a per-category
    // total so a single ring stays readable.
    const pieData = data.map((row) => {
      const total = seriesKeys.reduce(
        (a, sk) => a + (typeof row[sk] === "number" ? (row[sk] as number) : 0),
        0,
      )
      return { name: String(row.category), value: total }
    })
    const pieConfig: UiChartConfig = {}
    pieData.forEach((d, i) => {
      pieConfig[d.name] = { label: d.name, color: seriesColor(i) }
    })
    return (
      <Frame config={pieConfig} height={height}>
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent />} />
          <Pie
            data={pieData}
            dataKey="value"
            nameKey="name"
            outerRadius="80%"
          >
            {pieData.map((_, i) => (
              <Cell key={i} fill={seriesColor(i)} />
            ))}
          </Pie>
          <Legend />
        </PieChart>
      </Frame>
    )
  }

  const xAxis = (
    <XAxis
      dataKey="category"
      tickLine={false}
      axisLine={false}
      fontSize={11}
      interval={0}
      angle={data.length > 5 ? -30 : 0}
      textAnchor={data.length > 5 ? "end" : "middle"}
      height={data.length > 5 ? 66 : 28}
    />
  )
  const yAxis = (
    <YAxis
      tickLine={false}
      axisLine={false}
      fontSize={11}
      width={44}
      tickFormatter={(v: number) => fmt(v)}
    />
  )

  if (config.type === "line") {
    return (
      <Frame config={uiConfig} height={height}>
        <LineChart data={data}>
          <CartesianGrid vertical={false} />
          {xAxis}
          {yAxis}
          <ChartTooltip content={<ChartTooltipContent />} />
          {hasSeries && <Legend />}
          {seriesKeys.map((sk, i) => (
            <Line
              key={sk}
              type="monotone"
              dataKey={sk}
              name={sk === "value" ? valueLabel : sk}
              stroke={seriesColor(i)}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </Frame>
    )
  }

  if (config.type === "area") {
    return (
      <Frame config={uiConfig} height={height}>
        <AreaChart data={data}>
          <CartesianGrid vertical={false} />
          {xAxis}
          {yAxis}
          <ChartTooltip content={<ChartTooltipContent />} />
          {hasSeries && <Legend />}
          {seriesKeys.map((sk, i) => (
            <Area
              key={sk}
              type="monotone"
              dataKey={sk}
              name={sk === "value" ? valueLabel : sk}
              stackId="a"
              stroke={seriesColor(i)}
              fill={seriesColor(i)}
              fillOpacity={0.2}
            />
          ))}
        </AreaChart>
      </Frame>
    )
  }

  // Default: bar (grouped when multi-series).
  return (
    <Frame config={uiConfig} height={height}>
      <BarChart data={data}>
        <CartesianGrid vertical={false} />
        {xAxis}
        {yAxis}
        <ChartTooltip content={<ChartTooltipContent />} />
        {hasSeries && <Legend />}
        {seriesKeys.map((sk, i) => (
          <Bar
            key={sk}
            dataKey={sk}
            name={sk === "value" ? valueLabel : sk}
            fill={seriesColor(i)}
            radius={hasSeries ? 2 : 4}
          />
        ))}
      </BarChart>
    </Frame>
  )
}

/** Title line for a chart, derived from its config when the user hasn't named it. */
export function autoChartTitle(config: ChartConfig, fields: Field[]): string {
  if (config.title.trim()) return config.title
  const val = valueColumnLabel(config, fields)
  const dim = fieldLabel(fields, config.dimension)
  if (config.type === "kpi") return val
  return dim ? `${val} by ${dim}` : val
}
