"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { IconDownload, IconTable } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  todayIso,
  mondayOfIso,
  addDaysIso,
  monthRange,
  formatMinutes,
  minutesToHours,
  formatClock,
  formatDayLabel,
} from "@/features/timesheets/lib/time"

type Scope = "team" | "org"
type Preset = "day" | "week" | "month" | "custom"

const PRESETS: [Preset, string][] = [
  ["day", "Day"],
  ["week", "Week"],
  ["month", "Month"],
  ["custom", "Custom range"],
]

function rangeFor(
  preset: Preset,
  anchor: string,
  custom: { from: string; to: string },
): { from: string; to: string } {
  if (preset === "day") return { from: anchor, to: anchor }
  if (preset === "week") {
    const monday = mondayOfIso(anchor)
    return { from: monday, to: addDaysIso(monday, 6) }
  }
  if (preset === "month") return monthRange(anchor)
  return custom
}

function csvCell(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Detailed timesheet export. One row per time entry — staff, project, task,
 * start time, date, hours and more — for a chosen day / week / month / custom
 * range. Scope drives which people are included: `team` = the caller's reporting
 * tree; `org` = the whole organisation. Filters (dept/team/project) currently in
 * effect on the board are applied.
 */
export function TimesheetExportDialog({
  open,
  onOpenChange,
  scope,
  anchor,
  view,
  departmentId,
  teamId,
  projectId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  scope: Scope
  anchor: string
  view: "day" | "week" | "month"
  departmentId?: Id<"departments">
  teamId?: Id<"teams">
  projectId?: Id<"projects">
}) {
  // Default the range preset to whatever view the board is on.
  const [preset, setPreset] = React.useState<Preset>(view)
  const [custom, setCustom] = React.useState({
    from: monthRange(anchor).from,
    to: todayIso(),
  })

  // Re-seed the preset each time the dialog is opened from a different view.
  React.useEffect(() => {
    if (open) setPreset(view)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const range = rangeFor(preset, anchor, custom)

  const orgRows = useQuery(
    api.timeEntries.orgExportRows,
    open && scope === "org"
      ? { from: range.from, to: range.to, departmentId, teamId, projectId }
      : "skip",
  )
  const teamRows = useQuery(
    api.timeEntries.teamExportRows,
    open && scope === "team"
      ? { from: range.from, to: range.to, departmentId, teamId, projectId }
      : "skip",
  )
  const rows = scope === "org" ? orgRows : teamRows

  const totalMinutes = (rows ?? []).reduce((s, r) => s + r.minutes, 0)

  function download() {
    if (!rows || rows.length === 0) {
      toast.error("Nothing to export for this range.")
      return
    }
    const header = [
      "Date",
      "Employee",
      "Employee #",
      "Job title",
      "Department",
      "Team",
      "Project",
      "Task",
      "Start time",
      "Hours",
      "Minutes",
      "Billable",
      "Description",
    ]
    const lines = [header.map(csvCell).join(",")]
    for (const r of rows) {
      lines.push(
        [
          csvCell(r.date),
          csvCell(r.employeeName),
          csvCell(r.employeeNumber),
          csvCell(r.jobTitle ?? ""),
          csvCell(r.department ?? ""),
          csvCell(r.team ?? ""),
          csvCell(r.projectName),
          csvCell(r.taskName ?? ""),
          csvCell(r.startMinute != null ? formatClock(r.startMinute) : ""),
          csvCell(minutesToHours(r.minutes)),
          csvCell(r.minutes),
          csvCell(r.billable ? "Yes" : "No"),
          csvCell(r.description),
        ].join(","),
      )
    }
    // Grand total row.
    lines.push(
      [
        "",
        "TOTAL",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        csvCell(minutesToHours(totalMinutes)),
        csvCell(totalMinutes),
        "",
        "",
      ].join(","),
    )
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `timesheet-${scope}-${range.from}_to_${range.to}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success("Timesheet exported")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconTable className="size-5" />
            Export timesheet
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Range</Label>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPreset(key)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    preset === key
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "hover:bg-accent border-input",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {preset === "custom" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label className="text-xs">From</Label>
                <Input
                  type="date"
                  className="w-full min-w-0"
                  value={custom.from}
                  onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label className="text-xs">To</Label>
                <Input
                  type="date"
                  className="w-full min-w-0"
                  value={custom.to}
                  onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                />
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">
              {range.from === range.to
                ? formatDayLabel(range.from)
                : `${formatDayLabel(range.from)} → ${formatDayLabel(range.to)}`}
            </p>
          )}

          <div className="bg-muted/30 flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm">
            {rows === undefined ? (
              <Skeleton className="h-5 w-40" />
            ) : (
              <>
                <span className="text-muted-foreground">
                  {rows.length} {rows.length === 1 ? "entry" : "entries"}
                  {scope === "team" ? " · your team" : " · whole org"}
                </span>
                <span className="font-medium tabular-nums">
                  {formatMinutes(totalMinutes)}
                </span>
              </>
            )}
          </div>
          <p className="text-muted-foreground text-[11px]">
            Includes staff, project, task, start time, date, hours, billable and
            description — one row per logged entry, plus a grand total.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={download}
            disabled={rows === undefined || rows.length === 0}
          >
            <IconDownload className="size-4" />
            Export CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
