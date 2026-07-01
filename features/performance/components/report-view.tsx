"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  XAxis,
  YAxis,
} from "recharts"
import type { FunctionReturnType } from "convex/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type Report = NonNullable<FunctionReturnType<typeof api.performance.report>>
type ReportEmployee = Report["employees"][number]

const ALL = "__all__"

function ratingText(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(1)}/5`
}

const distConfig: ChartConfig = {
  count: { label: "Employees", color: "var(--chart-1, #f59e0b)" },
}
const compConfig: ChartConfig = {
  avg: { label: "Average rating", color: "var(--chart-2, #3b82f6)" },
}

export function ReportView({ cycleId }: { cycleId?: Id<"reviewCycles"> }) {
  const [selectedCycle, setSelectedCycle] = React.useState<
    Id<"reviewCycles"> | undefined
  >(cycleId)
  const data = useQuery(
    api.performance.report,
    selectedCycle ? { cycleId: selectedCycle } : {},
  )

  const [search, setSearch] = React.useState("")
  const [dept, setDept] = React.useState<string>(ALL)
  const [office, setOffice] = React.useState<string>(ALL)
  const [appraiser, setAppraiser] = React.useState<string>(ALL)

  if (data === undefined) {
    return (
      <div className="flex flex-col gap-4 px-4 lg:px-6">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }
  if (data === null) {
    return (
      <div className="text-muted-foreground px-4 py-10 text-sm lg:px-6">
        No review cycles yet.
      </div>
    )
  }

  const { cycle, cycles, employees, distribution, competencyAverages } = data

  // Filter option lists.
  const departments = dedupe(
    employees.map((e) => e.departmentName).filter(Boolean) as string[],
  )
  const offices = dedupe(
    employees.map((e) => e.officeName).filter(Boolean) as string[],
  )
  const appraisers = dedupe(
    employees.map((e) => e.appraiserName).filter(Boolean) as string[],
  )

  const filtered = employees.filter((e) => {
    if (search && !e.name.toLowerCase().includes(search.toLowerCase()))
      return false
    if (dept !== ALL && e.departmentName !== dept) return false
    if (office !== ALL && e.officeName !== office) return false
    if (appraiser !== ALL && e.appraiserName !== appraiser) return false
    return true
  })

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Report — {cycle.name}</h2>
        <Select
          value={cycle._id}
          onValueChange={(v) => setSelectedCycle(v as Id<"reviewCycles">)}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {cycles.map((c) => (
              <SelectItem key={c._id} value={c._id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Overall Rating Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={distConfig} className="h-64 w-full">
              <BarChart data={distribution}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="range"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="#f59e0b" radius={4} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Competencies Rating</CardTitle>
          </CardHeader>
          <CardContent>
            {competencyAverages.length === 0 ? (
              <p className="text-muted-foreground py-16 text-center text-sm">
                No competency ratings yet.
              </p>
            ) : (
              <ChartContainer config={compConfig} className="h-64 w-full">
                <BarChart data={competencyAverages}>
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    interval={0}
                    tickFormatter={(v: string) =>
                      v.length > 12 ? v.slice(0, 12) + "…" : v
                    }
                  />
                  <YAxis domain={[0, 5]} tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="avg" radius={4}>
                    {competencyAverages.map((_, i) => (
                      <Cell key={i} fill="#3b82f6" />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Employees Performance Summary</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search for employee"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56"
            />
            <FilterSelect
              value={dept}
              onChange={setDept}
              placeholder="Select department"
              options={departments}
            />
            <FilterSelect
              value={office}
              onChange={setOffice}
              placeholder="Select office"
              options={offices}
            />
            <FilterSelect
              value={appraiser}
              onChange={setAppraiser}
              placeholder="Appraiser"
              options={appraisers}
            />
            <Button
              variant="link"
              className="text-primary"
              onClick={() => {
                setSearch("")
                setDept(ALL)
                setOffice(ALL)
                setAppraiser(ALL)
              }}
            >
              Reset Filter
            </Button>
          </div>

          <p className="text-muted-foreground text-sm">
            Showing {filtered.length} of {employees.length} employee(s)
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs uppercase">
                  <th className="py-2 pr-4 font-medium">Employee</th>
                  <th className="py-2 pr-4 font-medium">Department</th>
                  <th className="py-2 pr-4 font-medium">Level</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Overall</th>
                  <th className="py-2 pr-4 font-medium">Objective</th>
                  <th className="py-2 pr-4 font-medium">Competency</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <EmployeeRow key={e.reviewId} e={e} />
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      className="text-muted-foreground py-8 text-center"
                    >
                      No employees match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function EmployeeRow({ e }: { e: ReportEmployee }) {
  return (
    <tr className="border-b last:border-0">
      <td className="py-3 pr-4">
        <div className="font-medium">{e.name}</div>
        {e.appraiserName && (
          <div className="text-muted-foreground text-xs">
            Appraiser: {e.appraiserName}
          </div>
        )}
      </td>
      <td className="text-muted-foreground py-3 pr-4">
        {e.departmentName ?? "—"}
      </td>
      <td className="py-3 pr-4">
        {e.level != null ? <Badge variant="outline">Level {e.level}</Badge> : "—"}
      </td>
      <td className="py-3 pr-4">
        {e.appraiserCompleted ? (
          <Badge>Completed</Badge>
        ) : e.selfSubmitted ? (
          <Badge variant="secondary">Self appraised</Badge>
        ) : (
          <Badge variant="outline">Pending</Badge>
        )}
      </td>
      <td className="py-3 pr-4 font-medium">{ratingText(e.overallRating)}</td>
      <td className="text-muted-foreground py-3 pr-4">
        {ratingText(e.objectivesScore)}
      </td>
      <td className="text-muted-foreground py-3 pr-4">
        {ratingText(e.competenciesScore)}
      </td>
      <td className="py-3">
        <Button asChild size="sm">
          <Link href={`/hr-lounge/performance/appraisals/${e.reviewId}`}>
            See Appraisal
          </Link>
        </Button>
      </td>
    </tr>
  )
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  options: string[]
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-44">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b))
}
