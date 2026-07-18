"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import {
  IconPencil,
  IconChevronLeft,
  IconChevronRight,
  IconClockHour4,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { AttendanceStatus } from "@/convex/lib/enums"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { RequestCorrectionDialog } from "@/features/attendance/components/request-correction-dialog"
import {
  ATTENDANCE_STATUS_BADGE,
  ATTENDANCE_STATUS_LABELS,
  formatDay,
  formatTime,
  formatDuration,
} from "@/features/attendance/lib/labels"

type Row = FunctionReturnType<typeof api.attendance.myHistory>[number]
type View = "day" | "week" | "month" | "table"

// ─── Date helpers (no external lib; work off local calendar dates) ───────────
function pad(n: number) {
  return String(n).padStart(2, "0")
}
function toISO(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function fromISO(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}
function addDays(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
function addMonths(d: Date, n: number) {
  const x = new Date(d)
  x.setDate(1)
  x.setMonth(x.getMonth() + n)
  return x
}
/** Monday-anchored start of the week containing `d`. */
function startOfWeek(d: Date) {
  const x = new Date(d)
  const offset = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - offset)
  return x
}

const STATUS_DOT: Record<AttendanceStatus, string> = {
  open: "bg-primary",
  completed: "bg-emerald-500",
}
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

function dayWorkedMinutes(records: Row[]) {
  return records.reduce((sum, r) => sum + (r.workedMinutes ?? 0), 0)
}

export function AttendanceHistory() {
  const rows = useQuery(api.attendance.myHistory)
  const [view, setView] = React.useState<View>("month")
  const [cursor, setCursor] = React.useState<Date>(() => new Date())

  // Group records by their office-local ISO date for calendar lookups.
  const byDate = React.useMemo(() => {
    const map = new Map<string, Row[]>()
    for (const r of rows ?? []) {
      const list = map.get(r.date)
      if (list) list.push(r)
      else map.set(r.date, [r])
    }
    // Newest clock-in first within a day.
    for (const list of map.values())
      list.sort((a, b) => b.clockInAt - a.clockInAt)
    return map
  }, [rows])

  const today = new Date()
  const loading = rows === undefined

  function shift(dir: -1 | 1) {
    if (view === "month") setCursor((c) => addMonths(c, dir))
    else if (view === "week") setCursor((c) => addDays(c, dir * 7))
    else setCursor((c) => addDays(c, dir))
  }

  const rangeLabel =
    view === "month"
      ? cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : view === "week"
        ? (() => {
            const s = startOfWeek(cursor)
            const e = addDays(s, 6)
            const sameMonth = s.getMonth() === e.getMonth()
            const sFmt = s.toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
            })
            const eFmt = e.toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })
            return sameMonth
              ? `${s.getDate()} – ${eFmt}`
              : `${sFmt} – ${eFmt}`
          })()
        : cursor.toLocaleDateString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })

  return (
    <Card className="mx-4 lg:mx-6">
      <CardHeader className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Recent attendance</CardTitle>
          <RequestCorrectionDialog
            trigger={
              <Button variant="outline" size="sm">
                <IconPencil className="size-4" />
                Request correction
              </Button>
            }
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => v && setView(v as View)}
            variant="outline"
            size="sm"
            className="justify-start"
          >
            <ToggleGroupItem value="day" className="px-3">
              Day
            </ToggleGroupItem>
            <ToggleGroupItem value="week" className="px-3">
              Week
            </ToggleGroupItem>
            <ToggleGroupItem value="month" className="px-3">
              Month
            </ToggleGroupItem>
            <ToggleGroupItem value="table" className="px-3">
              Table
            </ToggleGroupItem>
          </ToggleGroup>

          {view !== "table" && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCursor(new Date())}
              >
                Today
              </Button>
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label="Previous"
                  onClick={() => shift(-1)}
                >
                  <IconChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label="Next"
                  onClick={() => shift(1)}
                >
                  <IconChevronRight className="size-4" />
                </Button>
              </div>
              <span className="text-sm font-medium tabular-nums">
                {rangeLabel}
              </span>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : view === "table" ? (
          <TableView rows={rows} />
        ) : view === "month" ? (
          <MonthView cursor={cursor} today={today} byDate={byDate} />
        ) : view === "week" ? (
          <WeekView cursor={cursor} today={today} byDate={byDate} />
        ) : (
          <DayView cursor={cursor} today={today} byDate={byDate} />
        )}
      </CardContent>
    </Card>
  )
}

// ─── Month ───────────────────────────────────────────────────────────────────
function MonthView({
  cursor,
  today,
  byDate,
}: {
  cursor: Date
  today: Date
  byDate: Map<string, Row[]>
}) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const gridStart = startOfWeek(first)
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="grid grid-cols-7 border-b bg-muted/40">
        {WEEKDAY_LABELS.map((d) => (
          <div
            key={d}
            className="text-muted-foreground px-2 py-1.5 text-center text-xs font-medium"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((date, i) => {
          const iso = toISO(date)
          const records = byDate.get(iso) ?? []
          const inMonth = date.getMonth() === cursor.getMonth()
          const isToday = toISO(today) === iso
          const worked = dayWorkedMinutes(records)
          const primary = records[0]
          return (
            <div
              key={iso}
              className={cn(
                "min-h-[74px] border-b border-r p-1.5 last:border-r-0 sm:min-h-[92px]",
                i % 7 === 6 && "border-r-0",
                !inMonth && "bg-muted/20",
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                    isToday && "bg-primary text-primary-foreground font-semibold",
                    !inMonth && "text-muted-foreground/60",
                  )}
                >
                  {date.getDate()}
                </span>
                {records.length > 0 && (
                  <span
                    className={cn(
                      "size-1.5 rounded-full",
                      STATUS_DOT[primary.status],
                    )}
                  />
                )}
              </div>
              {primary && (
                <div className="mt-1 flex flex-col gap-0.5">
                  <span className="text-[11px] leading-tight tabular-nums">
                    {formatTime(primary.clockInAt)}
                    {primary.clockOutAt
                      ? `–${formatTime(primary.clockOutAt)}`
                      : ""}
                  </span>
                  {worked > 0 && (
                    <span className="text-muted-foreground text-[11px] leading-tight">
                      {formatDuration(worked)}
                    </span>
                  )}
                  {records.length > 1 && (
                    <span className="text-muted-foreground text-[10px] leading-tight">
                      +{records.length - 1} more
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Week ────────────────────────────────────────────────────────────────────
function WeekView({
  cursor,
  today,
  byDate,
}: {
  cursor: Date
  today: Date
  byDate: Map<string, Row[]>
}) {
  const start = startOfWeek(cursor)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const weekTotal = days.reduce(
    (sum, d) => sum + dayWorkedMinutes(byDate.get(toISO(d)) ?? []),
    0,
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
        {days.map((date) => {
          const iso = toISO(date)
          const records = byDate.get(iso) ?? []
          const isToday = toISO(today) === iso
          return (
            <div
              key={iso}
              className={cn(
                "flex flex-col gap-1.5 rounded-lg border p-2",
                isToday && "border-primary/50 bg-primary/5",
              )}
            >
              <div className="flex items-center justify-between sm:flex-col sm:items-start sm:gap-0.5">
                <span className="text-muted-foreground text-xs font-medium">
                  {date.toLocaleDateString(undefined, { weekday: "short" })}
                </span>
                <span
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    isToday && "text-primary",
                  )}
                >
                  {date.getDate()}
                </span>
              </div>
              {records.length === 0 ? (
                <span className="text-muted-foreground/50 text-xs">—</span>
              ) : (
                records.map((r) => <RecordChip key={r._id} row={r} />)
              )}
            </div>
          )
        })}
      </div>
      {weekTotal > 0 && (
        <p className="text-muted-foreground text-xs">
          Total this week:{" "}
          <span className="text-foreground font-medium">
            {formatDuration(weekTotal)}
          </span>
        </p>
      )}
    </div>
  )
}

// ─── Day ─────────────────────────────────────────────────────────────────────
function DayView({
  cursor,
  today,
  byDate,
}: {
  cursor: Date
  today: Date
  byDate: Map<string, Row[]>
}) {
  const iso = toISO(cursor)
  const records = byDate.get(iso) ?? []
  const total = dayWorkedMinutes(records)
  const isToday = toISO(today) === iso

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <IconClockHour4 className="text-muted-foreground/40 size-8" />
        <p className="text-muted-foreground text-sm">
          No attendance recorded{isToday ? " today" : " on this day"}.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {records.map((r) => (
        <div
          key={r._id}
          className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-full",
                r.status === "open"
                  ? "bg-primary/10 text-primary"
                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
              )}
            >
              <IconClockHour4 className="size-5" />
            </span>
            <div>
              <p className="font-medium tabular-nums">
                {formatTime(r.clockInAt)} —{" "}
                {r.clockOutAt ? formatTime(r.clockOutAt) : "still in"}
              </p>
              <p className="text-muted-foreground text-xs">
                {r.officeName ?? "No office"} · {formatDuration(r.workedMinutes)}
              </p>
            </div>
          </div>
          <Badge variant={ATTENDANCE_STATUS_BADGE[r.status]}>
            {ATTENDANCE_STATUS_LABELS[r.status]}
          </Badge>
        </div>
      ))}
      {total > 0 && (
        <p className="text-muted-foreground text-xs">
          Total:{" "}
          <span className="text-foreground font-medium">
            {formatDuration(total)}
          </span>
        </p>
      )}
    </div>
  )
}

// ─── Table (original view) ───────────────────────────────────────────────────
function TableView({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No attendance recorded yet.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>In</TableHead>
            <TableHead>Out</TableHead>
            <TableHead>Worked</TableHead>
            <TableHead>Office</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r._id}>
              <TableCell className="text-sm">{formatDay(r.clockInAt)}</TableCell>
              <TableCell className="tabular-nums">
                {formatTime(r.clockInAt)}
              </TableCell>
              <TableCell className="tabular-nums">
                {r.clockOutAt ? formatTime(r.clockOutAt) : "—"}
              </TableCell>
              <TableCell className="tabular-nums">
                {formatDuration(r.workedMinutes)}
              </TableCell>
              <TableCell className="text-sm">{r.officeName ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={ATTENDANCE_STATUS_BADGE[r.status]}>
                  {ATTENDANCE_STATUS_LABELS[r.status]}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

// Compact clock-in/out chip used in the week columns.
function RecordChip({ row }: { row: Row }) {
  return (
    <div className="bg-muted/60 flex flex-col gap-0.5 rounded-md px-1.5 py-1">
      <div className="flex items-center gap-1">
        <span className={cn("size-1.5 rounded-full", STATUS_DOT[row.status])} />
        <span className="text-[11px] leading-tight tabular-nums">
          {formatTime(row.clockInAt)}
          {row.clockOutAt ? `–${formatTime(row.clockOutAt)}` : ""}
        </span>
      </div>
      {row.workedMinutes != null && row.workedMinutes > 0 && (
        <span className="text-muted-foreground pl-2.5 text-[10px] leading-tight">
          {formatDuration(row.workedMinutes)}
        </span>
      )}
    </div>
  )
}
