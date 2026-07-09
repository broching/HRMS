"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery, useMutation } from "convex/react"
import {
  IconChevronLeft,
  IconChevronRight,
  IconSearch,
  IconBell,
  IconReportAnalytics,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { formatRange } from "@/features/leave-admin/lib/labels"

const ALL = "all"
const iso = (d: Date) => d.toISOString().slice(0, 10)
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

/** Low-opacity tint for a hex colour used as the chip background. */
function tint(color: string): string | undefined {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}26` : undefined
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
}

export function LeaveCalendarOverview({
  onSelectRequest,
}: {
  onSelectRequest: (id: Id<"leaveRequests">) => void
}) {
  const now = new Date()
  const [cursor, setCursor] = React.useState({
    y: now.getUTCFullYear(),
    m: now.getUTCMonth(),
  })
  const [search, setSearch] = React.useState("")
  const [departmentId, setDepartmentId] = React.useState(ALL)
  const [officeId, setOfficeId] = React.useState(ALL)
  const [leaveTypeId, setLeaveTypeId] = React.useState(ALL)
  const [showInactive, setShowInactive] = React.useState(false)
  const [rightTab, setRightTab] = React.useState<"employees" | "pending">(
    "employees",
  )

  const departments = useQuery(api.departments.list) ?? []
  const offices = useQuery(api.offices.list) ?? []
  const leaveTypes = useQuery(api.leaveTypes.list, {}) ?? []
  const nudge = useMutation(api.leaveRequests.nudgeApprovers)

  const first = new Date(Date.UTC(cursor.y, cursor.m, 1))
  const offset = (first.getUTCDay() + 6) % 7
  const gridStart = new Date(first)
  gridStart.setUTCDate(first.getUTCDate() - offset)
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart)
    d.setUTCDate(gridStart.getUTCDate() + i)
    return iso(d)
  })

  const filters = {
    departmentId:
      departmentId === ALL ? undefined : (departmentId as Id<"departments">),
    officeId: officeId === ALL ? undefined : (officeId as Id<"offices">),
    leaveTypeId:
      leaveTypeId === ALL ? undefined : (leaveTypeId as Id<"leaveTypes">),
    includeInactive: showInactive,
  }

  const leave = useQuery(api.leaveDashboard.adminCalendar, {
    start: cells[0],
    end: cells[41],
    ...filters,
  })
  const employees = useQuery(api.leaveDashboard.employees, {
    search: search || undefined,
    departmentId: filters.departmentId,
    officeId: filters.officeId,
    includeInactive: showInactive,
  })
  const pending = useQuery(api.leaveDashboard.pending, {})
  const holidays = useQuery(api.holidays.list, { year: cursor.y })
  const holidayByDate = new Map((holidays ?? []).map((h) => [h.date, h.name]))

  const monthLabel = first.toLocaleString("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })

  function shift(delta: number) {
    setCursor((c) => {
      const m = c.m + delta
      return { y: c.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 }
    })
  }

  const years = Array.from({ length: 7 }, (_, i) => now.getUTCFullYear() - 3 + i)

  async function handleNudge() {
    try {
      const count = await nudge({})
      toast.success(
        count > 0 ? `Nudged ${count} approver(s).` : "No pending approvals to nudge.",
      )
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not nudge")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Top bar: title + year + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium">Calendar Overview</h2>
        <div className="flex items-center gap-2">
          <Select
            value={String(cursor.y)}
            onValueChange={(v) => setCursor((c) => ({ ...c, y: Number(v) }))}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => toast.info("Reports are coming soon.")}
          >
            <IconReportAnalytics className="size-4" /> Reports
          </Button>
          <Button variant="outline" onClick={handleNudge}>
            <IconBell className="size-4" /> Nudge approvers
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <IconSearch className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search for name / ID"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={departmentId} onValueChange={setDepartmentId}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d._id} value={d._id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={officeId} onValueChange={setOfficeId}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All offices" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All offices</SelectItem>
            {offices.map((o) => (
              <SelectItem key={o._id} value={o._id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All leave types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All leave types</SelectItem>
            {leaveTypes.map((t) => (
              <SelectItem key={t._id} value={t._id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={showInactive}
            onCheckedChange={(v) => setShowInactive(!!v)}
          />
          Show inactive
        </label>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Calendar */}
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" onClick={() => shift(-1)}>
                <IconChevronLeft className="size-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={() => shift(1)}>
                <IconChevronRight className="size-4" />
              </Button>
              <span className="ml-2 text-base font-medium">{monthLabel}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setCursor({ y: now.getUTCFullYear(), m: now.getUTCMonth() })
              }
            >
              Today
            </Button>
          </div>

          <div className="grid grid-cols-7 overflow-hidden rounded-lg border text-sm">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="bg-muted/50 text-muted-foreground border-b p-2 text-center text-xs font-medium"
              >
                {d}
              </div>
            ))}
            {cells.map((date) => {
              const inMonth = date.slice(0, 7) === iso(first).slice(0, 7)
              const holiday = holidayByDate.get(date)
              const dayLeave = (leave ?? []).filter(
                (r) => r.startDate <= date && r.endDate >= date,
              )
              return (
                <div
                  key={date}
                  className={cn(
                    "min-h-24 border-b border-r p-1.5 [&:nth-child(7n+1)]:border-l-0",
                    !inMonth && "bg-muted/30 text-muted-foreground",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs">{Number(date.slice(-2))}</span>
                    {holiday && (
                      <span
                        className="truncate text-[10px] text-rose-600"
                        title={holiday}
                      >
                        {holiday}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-col gap-0.5">
                    {dayLeave.slice(0, 3).map((r) => (
                      <button
                        key={r._id}
                        onClick={() => onSelectRequest(r._id)}
                        className="flex items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] hover:brightness-95"
                        style={{ backgroundColor: tint(r.leaveTypeColor) }}
                        title={`${r.employeeName} · ${r.leaveTypeName} (${r.status})`}
                      >
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: r.leaveTypeColor }}
                        />
                        <span className="truncate">{r.employeeName}</span>
                      </button>
                    ))}
                    {dayLeave.length > 3 && (
                      <span className="text-muted-foreground text-[10px]">
                        +{dayLeave.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div className="text-muted-foreground mt-3 flex flex-wrap gap-3 text-xs">
            {leaveTypes.map((t) => (
              <span key={t._id} className="flex items-center gap-1.5">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: t.color }}
                />
                {t.name}
              </span>
            ))}
          </div>
        </div>

        {/* Right rail */}
        <div className="rounded-lg border">
          <div className="flex border-b">
            <RailTab
              active={rightTab === "employees"}
              onClick={() => setRightTab("employees")}
            >
              Employees ({employees?.length ?? 0})
            </RailTab>
            <RailTab
              active={rightTab === "pending"}
              onClick={() => setRightTab("pending")}
            >
              Pending ({pending?.length ?? 0})
            </RailTab>
          </div>

          <div className="max-h-[28rem] overflow-y-auto">
            {rightTab === "employees" ? (
              <>
                <p className="text-muted-foreground px-3 py-2 text-center text-xs">
                  Click an employee to open their profile.
                </p>
                {(employees ?? []).map((e) => (
                  <Link
                    key={e._id}
                    href={`/employees/${e._id}`}
                    className="hover:bg-accent/50 flex items-center gap-3 border-t px-3 py-2.5"
                  >
                    <Avatar className="size-8">
                      <AvatarImage src={e.photoUrl ?? undefined} />
                      <AvatarFallback className="text-xs">
                        {initials(e.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">
                        {e.name}
                      </span>
                      <span className="text-muted-foreground truncate text-xs">
                        {e.positionTitle ?? e.departmentName ?? "—"}
                      </span>
                    </div>
                  </Link>
                ))}
                {employees && employees.length === 0 && (
                  <p className="text-muted-foreground p-4 text-center text-sm">
                    No employees.
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-muted-foreground px-3 py-2 text-center text-xs">
                  List of pending leave requests.
                </p>
                {(pending ?? []).map((r) => (
                  <button
                    key={r._id}
                    onClick={() => onSelectRequest(r._id)}
                    className="hover:bg-accent/50 flex w-full items-center gap-3 border-t px-3 py-2.5 text-left"
                  >
                    <Avatar className="size-8">
                      <AvatarImage src={r.employeePhotoUrl ?? undefined} />
                      <AvatarFallback className="text-xs">
                        {initials(r.employeeName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">
                        {r.employeeName}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {formatRange(r.startDate, r.endDate)}
                      </span>
                      <span className="flex items-center gap-1 text-xs">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: r.leaveTypeColor }}
                        />
                        {r.leaveTypeName}
                      </span>
                    </div>
                  </button>
                ))}
                {pending && pending.length === 0 && (
                  <p className="text-muted-foreground p-4 text-center text-sm">
                    Nothing pending.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function RailTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "border-primary text-primary border-b-2"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}
