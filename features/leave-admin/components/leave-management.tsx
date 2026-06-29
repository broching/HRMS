"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { IconSearch } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import {
  LEAVE_STATUS_LABELS,
  LEAVE_STATUS_BADGE,
  formatRange,
} from "@/features/leave-admin/lib/labels"

const ALL = "all"

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
}

export function LeaveManagement({
  onSelectRequest,
}: {
  onSelectRequest: (id: Id<"leaveRequests">) => void
}) {
  const now = new Date()
  const [year, setYear] = React.useState(now.getUTCFullYear())
  const [search, setSearch] = React.useState("")
  const [status, setStatus] = React.useState(ALL)
  const [leaveTypeId, setLeaveTypeId] = React.useState(ALL)

  const leaveTypes = useQuery(api.leaveTypes.list, {}) ?? []
  const rows = useQuery(api.leaveDashboard.adminCalendar, {
    start: `${year}-01-01`,
    end: `${year}-12-31`,
    leaveTypeId:
      leaveTypeId === ALL ? undefined : (leaveTypeId as Id<"leaveTypes">),
    includeInactive: true,
  })

  const term = search.trim().toLowerCase()
  const filtered = (rows ?? [])
    .filter((r) => status === ALL || r.status === status)
    .filter((r) => !term || r.employeeName.toLowerCase().includes(term))
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1))

  const years = Array.from({ length: 7 }, (_, i) => now.getUTCFullYear() - 3 + i)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <IconSearch className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search employee"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
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
        <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
          <SelectTrigger className="w-40">
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
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="info_requested">Info requested</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Leave type</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead className="text-right">Days</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows === undefined ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-10 text-center">
                  Loading…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-10 text-center">
                  No leave found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow
                  key={r._id}
                  className="cursor-pointer"
                  onClick={() => onSelectRequest(r._id)}
                >
                  <TableCell>
                    <span className="flex items-center gap-2.5">
                      <Avatar className="size-8">
                        <AvatarImage src={r.employeePhotoUrl ?? undefined} />
                        <AvatarFallback className="text-xs">
                          {initials(r.employeeName)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{r.employeeName}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: r.leaveTypeColor }}
                      />
                      {r.leaveTypeName}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatRange(r.startDate, r.endDate)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.totalDays}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        LEAVE_STATUS_BADGE[r.status],
                      )}
                    >
                      {LEAVE_STATUS_LABELS[r.status]}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
