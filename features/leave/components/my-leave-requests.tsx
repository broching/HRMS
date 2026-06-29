"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { IconPaperclip, IconSearch, IconChevronRight } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { LeaveStatus } from "@/convex/lib/enums"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import {
  LEAVE_STATUS_BADGE,
  LEAVE_STATUS_LABELS,
  formatLeaveDates,
  formatLeaveRange,
} from "@/features/leave/lib/labels"

const ALL = "all"
const STATUSES: LeaveStatus[] = [
  "pending",
  "approved",
  "info_requested",
  "rejected",
  "cancelled",
]

type Request = FunctionReturnType<typeof api.leaveRequests.mine>[number]

export function MyLeaveRequests() {
  const requests = useQuery(api.leaveRequests.mine)
  const leaveTypes = useQuery(api.leaveTypes.list, {}) ?? []
  const cancel = useMutation(api.leaveRequests.cancel)
  const respond = useMutation(api.leaveRequests.respond)

  const [typeId, setTypeId] = React.useState<string>(ALL)
  const [status, setStatus] = React.useState<string>(ALL)
  const [search, setSearch] = React.useState("")
  const [fromDate, setFromDate] = React.useState("")
  const [detail, setDetail] = React.useState<Request | null>(null)

  // Edit-and-explain form (shown for rejected / info-requested requests).
  const [editing, setEditing] = React.useState(false)
  const [editStart, setEditStart] = React.useState("")
  const [editEnd, setEditEnd] = React.useState("")
  const [editReason, setEditReason] = React.useState("")
  const [explanation, setExplanation] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  function openDetail(r: Request) {
    setDetail(r)
    setEditing(false)
    setEditStart(r.startDate)
    setEditEnd(r.endDate)
    setEditReason(r.reason ?? "")
    setExplanation("")
  }

  async function handleCancel(requestId: Id<"leaveRequests">) {
    try {
      await cancel({ requestId })
      toast.success("Request cancelled")
      setDetail(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel")
    }
  }

  async function handleResubmit() {
    if (!detail) return
    if (!explanation.trim()) {
      toast.error("Please explain your reasoning.")
      return
    }
    setBusy(true)
    try {
      await respond({
        requestId: detail._id,
        startDate: editStart,
        endDate: editEnd,
        reason: editReason.trim() || undefined,
        note: explanation.trim(),
      })
      toast.success("Resubmitted for approval")
      setDetail(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not resubmit")
    } finally {
      setBusy(false)
    }
  }

  const filtered = (requests ?? []).filter((r) => {
    if (typeId !== ALL && r.leaveTypeId !== typeId) return false
    if (status !== ALL && r.status !== status) return false
    if (fromDate && r.startDate < fromDate) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const hay = `${r.leaveTypeName} ${r.reason ?? ""} ${r.decisionNote ?? ""}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-col gap-3 px-4 lg:flex-row lg:items-center lg:px-6">
        <Select value={typeId} onValueChange={setTypeId}>
          <SelectTrigger className="w-full lg:w-48">
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
          <SelectTrigger className="w-full lg:w-40">
            <SelectValue placeholder="All status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All status</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {LEAVE_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative lg:max-w-xs lg:flex-1">
          <IconSearch className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search comment / type"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1">
          <Input
            type="date"
            aria-label="From date"
            className="w-full lg:w-44"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
          {fromDate && (
            <Button variant="ghost" size="sm" onClick={() => setFromDate("")}>
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="mx-4 rounded-lg border lg:mx-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Leave type</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Count</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Last comment</TableHead>
              <TableHead className="text-right">{""}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests === undefined ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-muted-foreground py-8 text-center"
                >
                  No leave requests found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const d = formatLeaveDates(r.startDate, r.endDate)
                const comment = r.decisionNote || r.reason || ""
                return (
                  <TableRow key={r._id}>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: r.leaveTypeColor }}
                        />
                        {r.leaveTypeName}
                        {r.attachmentUrl && (
                          <a href={r.attachmentUrl} target="_blank" rel="noreferrer">
                            <IconPaperclip className="text-muted-foreground size-3.5" />
                          </a>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="flex flex-col">
                        <span>{d.range}</span>
                        <span className="text-muted-foreground text-xs">
                          {d.weekdays}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {r.totalDays} {r.totalDays === 1 ? "day" : "days"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={LEAVE_STATUS_BADGE[r.status]}>
                        {LEAVE_STATUS_LABELS[r.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden max-w-[16rem] truncate md:table-cell">
                      {comment || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-primary"
                        onClick={() => openDetail(r)}
                      >
                        See details
                        <IconChevronRight className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-md">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span
                    className="size-3 rounded-full"
                    style={{ backgroundColor: detail.leaveTypeColor }}
                  />
                  {detail.leaveTypeName}
                </DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3 text-sm">
                <Row label="Dates">
                  {formatLeaveRange(
                    detail.startDate,
                    detail.endDate,
                    detail.startHalf,
                    detail.endHalf,
                  )}
                </Row>
                <Row label="Count">
                  {detail.totalDays} {detail.totalDays === 1 ? "day" : "days"}
                </Row>
                <Row label="Status">
                  <Badge variant={LEAVE_STATUS_BADGE[detail.status]}>
                    {LEAVE_STATUS_LABELS[detail.status]}
                  </Badge>
                </Row>
                {detail.reason && <Row label="Reason">{detail.reason}</Row>}
                {detail.decisionNote && (
                  <Row label="Decision note">{detail.decisionNote}</Row>
                )}
                {detail.attachmentUrl && (
                  <Row label="Attachment">
                    <a
                      href={detail.attachmentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary inline-flex items-center gap-1 underline"
                    >
                      <IconPaperclip className="size-3.5" /> View
                    </a>
                  </Row>
                )}
                {(detail.status === "pending" || detail.status === "approved") && (
                  <Button
                    variant="outline"
                    className="mt-2 self-start"
                    onClick={() => handleCancel(detail._id)}
                  >
                    Cancel request
                  </Button>
                )}

                {(detail.status === "rejected" ||
                  detail.status === "info_requested") &&
                  (editing ? (
                    <div className="mt-1 flex flex-col gap-3 rounded-lg border p-3">
                      <p className="text-sm font-medium">Edit &amp; resubmit</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="grid gap-1.5">
                          <Label className="text-xs">Start date</Label>
                          <Input
                            type="date"
                            value={editStart}
                            onChange={(e) => setEditStart(e.target.value)}
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <Label className="text-xs">End date</Label>
                          <Input
                            type="date"
                            value={editEnd}
                            min={editStart}
                            onChange={(e) => setEditEnd(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Reason</Label>
                        <Textarea
                          value={editReason}
                          onChange={(e) => setEditReason(e.target.value)}
                          placeholder="Update your reason (optional)"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">
                          Explanation to your approver
                        </Label>
                        <Textarea
                          value={explanation}
                          onChange={(e) => setExplanation(e.target.value)}
                          placeholder="Explain your reasoning so your approver can reconsider"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={handleResubmit}
                          disabled={busy || !explanation.trim()}
                        >
                          {busy ? "Resubmitting…" : "Resubmit"}
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() => setEditing(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      className="mt-2 self-start"
                      onClick={() => setEditing(true)}
                    >
                      Edit &amp; explain
                    </Button>
                  ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] items-center gap-2">
      <span className="text-muted-foreground text-xs uppercase">{label}</span>
      <span>{children}</span>
    </div>
  )
}
