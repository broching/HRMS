"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { IconDownload } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { PayslipDocument } from "./payslip-document"
import { printPayslip, splitPeriod } from "@/features/payroll/lib/labels"

const DOC_TYPES = [
  { value: "payslip", label: "Payslip", enabled: true },
  { value: "ea", label: "EA Form", enabled: false },
  { value: "pcb", label: "PCB II", enabled: false },
] as const

export function MyPayslips() {
  const slips = useQuery(api.payroll.myPayslips)

  const [year, setYear] = React.useState<string>("")
  const [period, setPeriod] = React.useState<string>("") // "YYYY-MM"

  // Available years (desc) and the months within the selected year.
  const years = React.useMemo(() => {
    const set = new Set((slips ?? []).map((s) => s.periodMonth.slice(0, 4)))
    return [...set].sort((a, b) => b.localeCompare(a))
  }, [slips])

  const monthsInYear = React.useMemo(() => {
    return (slips ?? [])
      .filter((s) => s.periodMonth.startsWith(year))
      .sort((a, b) => b.periodMonth.localeCompare(a.periodMonth))
  }, [slips, year])

  // Default to the most recent payslip once data loads.
  React.useEffect(() => {
    if (!slips || slips.length === 0 || period) return
    const latest = [...slips].sort((a, b) =>
      b.periodMonth.localeCompare(a.periodMonth),
    )[0]
    setYear(latest.periodMonth.slice(0, 4))
    setPeriod(latest.periodMonth)
  }, [slips, period])

  function onYearChange(y: string) {
    setYear(y)
    const first = (slips ?? [])
      .filter((s) => s.periodMonth.startsWith(y))
      .sort((a, b) => b.periodMonth.localeCompare(a.periodMonth))[0]
    if (first) setPeriod(first.periodMonth)
  }

  const selected = (slips ?? []).find((s) => s.periodMonth === period)
  const payslip = useQuery(
    api.payroll.getPayslip,
    selected ? { payslipId: selected._id as Id<"payslips"> } : "skip",
  )
  const employeeName = slips?.[0]?.employeeName ?? "My"

  if (slips === undefined) {
    return (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      {/* Document type tabs (EA Form / PCB II not applicable for SG) */}
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm">Document type</span>
        <div className="bg-muted inline-flex rounded-lg p-1">
          {DOC_TYPES.map((d) => (
            <button
              key={d.value}
              type="button"
              disabled={!d.enabled}
              title={d.enabled ? undefined : "Not applicable"}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                d.enabled
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground cursor-not-allowed opacity-60",
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {slips.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border py-16 text-center text-sm">
          No payslips available yet.
        </div>
      ) : (
        <>
          {/* Title + bulk download */}
          <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold">
              {employeeName}&apos;s Payslips
            </h2>
            <Button
              variant="outline"
              onClick={() =>
                toast.info("Bulk download is coming soon.")
              }
            >
              Payslip Bulk Download
            </Button>
          </div>

          {/* Year / month pickers */}
          <div className="flex flex-wrap gap-3 rounded-lg border bg-muted/30 p-3">
            <Select value={year} onValueChange={onYearChange}>
              <SelectTrigger className="w-40 bg-background">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={y}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-44 bg-background">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                {monthsInYear.map((s) => (
                  <SelectItem key={s._id} value={s.periodMonth}>
                    {splitPeriod(s.periodMonth).monthName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Selected payslip */}
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {selected
                ? `${employeeName} — ${splitPeriod(selected.periodMonth).monthName.slice(0, 3)} ${splitPeriod(selected.periodMonth).year}`
                : ""}
            </p>
            <Button onClick={printPayslip} disabled={!payslip}>
              <IconDownload className="size-4" />
              Download payslip
            </Button>
          </div>

          {payslip === undefined ? (
            <Skeleton className="h-96 w-full" />
          ) : (
            <PayslipDocument slip={payslip} />
          )}
        </>
      )}
    </div>
  )
}
