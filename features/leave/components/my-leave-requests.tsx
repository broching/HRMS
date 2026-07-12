"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import {
  IconPaperclip,
  IconSearch,
  IconChevronRight,
  IconFilter,
  IconCheck,
  IconX,
  IconFileText,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { LeaveStatus } from "@/convex/lib/enums"
import { cn } from "@/lib/utils"
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
  const [filtersOpen, setFiltersOpen] = React.useState(false)
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

  const activeFilters =
    (typeId !== ALL ? 1 : 0) + (status !== ALL ? 1 : 0) + (fromDate ? 1 : 0)

  return (
    <div className="flex flex-col gap-4">
      {/* Filters — search stays visible; the type/status/from-date controls
          collapse behind a "Filters" toggle on mobile so the request list keeps
          the screen. They show inline from lg. */}
      <div className="flex flex-col gap-3 px-4 lg:flex-row lg:items-center lg:px-6">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 lg:w-64 lg:flex-none">
            <IconSearch className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              placeholder="Search comment / type"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            className="shrink-0 lg:hidden"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <IconFilter className="size-4" />
            Filters
            {activeFilters > 0 && (
              <span className="bg-primary text-primary-foreground ml-0.5 flex size-5 items-center justify-center rounded-full text-xs tabular-nums">
                {activeFilters}
              </span>
            )}
          </Button>
        </div>
        <div
          className={cn(
            "flex-col gap-3 sm:flex-row lg:items-center",
            filtersOpen ? "flex" : "hidden lg:flex",
          )}
        >
          <Select value={typeId} onValueChange={setTypeId}>
            <SelectTrigger className="w-full sm:w-48">
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
            <SelectTrigger className="w-full sm:w-40">
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
          <div className="flex items-center gap-1">
            <Input
              type="date"
              aria-label="From date"
              className="w-full sm:w-44"
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
      </div>

      <div className="mx-4 flex min-h-[65vh] flex-col rounded-lg border lg:mx-6 lg:min-h-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Leave type</TableHead>
              <TableHead className="hidden sm:table-cell">Date</TableHead>
              <TableHead className="hidden sm:table-cell">Count</TableHead>
              <TableHead className="hidden sm:table-cell">Status</TableHead>
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
                  <TableRow
                    key={r._id}
                    className="hover:bg-muted/50 cursor-pointer"
                    onClick={() => openDetail(r)}
                  >
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: r.leaveTypeColor }}
                        />
                        <span className="font-medium">{r.leaveTypeName}</span>
                        {r.attachmentUrl && (
                          <a
                            href={r.attachmentUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <IconPaperclip className="text-muted-foreground size-3.5" />
                          </a>
                        )}
                      </span>
                      {/* Mobile: fold the hidden Date/Count/Status columns in here */}
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 sm:hidden">
                        <span className="text-muted-foreground text-xs">
                          {d.range}
                        </span>
                        <span className="text-muted-foreground text-xs tabular-nums">
                          · {r.totalDays} {r.totalDays === 1 ? "day" : "days"}
                        </span>
                        <Badge
                          variant={LEAVE_STATUS_BADGE[r.status]}
                          className="text-[10px]"
                        >
                          {LEAVE_STATUS_LABELS[r.status]}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-sm sm:table-cell">
                      <span className="flex flex-col">
                        <span>{d.range}</span>
                        <span className="text-muted-foreground text-xs">
                          {d.weekdays}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="hidden tabular-nums sm:table-cell">
                      {r.totalDays} {r.totalDays === 1 ? "day" : "days"}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant={LEAVE_STATUS_BADGE[r.status]}>
                        {LEAVE_STATUS_LABELS[r.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden max-w-[16rem] truncate md:table-cell">
                      {comment || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <IconChevronRight className="text-muted-foreground ml-auto size-4" />
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={detail !== null} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
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
              <div className="flex flex-col gap-4 text-sm">
                {/* Summary card */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border p-3">
                  <Cell label="Dates">
                    {formatLeaveRange(
                      detail.startDate,
                      detail.endDate,
                      detail.startHalf,
                      detail.endHalf,
                    )}
                  </Cell>
                  <Cell label="Count">
                    {detail.totalDays} {detail.totalDays === 1 ? "day" : "days"}
                  </Cell>
                  <Cell label="Status">
                    <Badge variant={LEAVE_STATUS_BADGE[detail.status]}>
                      {LEAVE_STATUS_LABELS[detail.status]}
                    </Badge>
                  </Cell>
                  {detail.currentApproverName &&
                    (detail.status === "pending" ||
                      detail.status === "info_requested") && (
                      <Cell label="Awaiting">{detail.currentApproverName}</Cell>
                    )}
                </div>

                {detail.reason && (
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs uppercase">
                      Reason
                    </span>
                    <p>{detail.reason}</p>
                  </div>
                )}
                {detail.decisionNote && (
                  <div className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs uppercase">
                      Decision note
                    </span>
                    <p className="text-muted-foreground">“{detail.decisionNote}”</p>
                  </div>
                )}

                {/* Approval chain stepper */}
                {detail.approvalChain.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-muted-foreground text-xs uppercase">
                      Approval
                    </span>
                    <ApprovalChain steps={detail.approvalChain} />
                  </div>
                )}

                {/* Attachment rendered inline */}
                {detail.attachmentUrl && (
                  <div className="flex flex-col gap-2">
                    <span className="text-muted-foreground text-xs uppercase">
                      Attachment
                    </span>
                    <AttachmentPreview
                      url={detail.attachmentUrl}
                      contentType={detail.attachmentContentType}
                    />
                  </div>
                )}

                {(detail.status === "pending" || detail.status === "approved") && (
                  <Button
                    variant="outline"
                    className="self-start"
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

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs uppercase">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  )
}

type ChainStep = Request["approvalChain"][number]

// Vertical stepper of the request's approval chain, marking each step's state.
function ApprovalChain({ steps }: { steps: ChainStep[] }) {
  return (
    <ol className="flex flex-col gap-2.5">
      {steps.map((s, i) => {
        const done = s.state === "approved"
        const rejected = s.state === "rejected"
        const current = s.state === "current"
        return (
          <li key={i} className="flex items-start gap-2.5">
            <span
              className={cn(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                done && "bg-primary text-primary-foreground border-transparent",
                rejected && "border-transparent bg-red-500 text-white",
                current && "border-primary text-primary",
                s.state === "upcoming" &&
                  "border-muted-foreground/30 text-muted-foreground",
              )}
            >
              {done ? (
                <IconCheck className="size-3.5" />
              ) : rejected ? (
                <IconX className="size-3.5" />
              ) : (
                i + 1
              )}
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "font-medium",
                    s.state === "upcoming" &&
                      "text-muted-foreground font-normal",
                  )}
                >
                  {s.label}
                </span>
                {current && (
                  <span className="bg-muted text-foreground/70 rounded-full px-2 py-0.5 text-xs">
                    Awaiting
                  </span>
                )}
              </span>
              {s.note && (
                <span className="text-muted-foreground mt-0.5 text-xs">
                  “{s.note}”
                </span>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// Render the attachment inline when it's an image or PDF; otherwise show a
// compact file card. Every variant links out to the original in a new tab.
function AttachmentPreview({
  url,
  contentType,
}: {
  url: string
  contentType: string | null
}) {
  const isImage = contentType?.startsWith("image/")
  const isPdf = contentType === "application/pdf"
  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img
          src={url}
          alt="Leave attachment"
          className="max-h-72 w-full rounded-lg border object-contain"
        />
      </a>
    )
  }
  if (isPdf) {
    return (
      <div className="flex flex-col gap-2">
        <iframe
          src={url}
          title="Leave attachment"
          className="h-72 w-full rounded-lg border"
        />
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-primary inline-flex items-center gap-1 text-sm underline"
        >
          <IconPaperclip className="size-3.5" /> Open in new tab
        </a>
      </div>
    )
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="hover:bg-accent/40 flex items-center gap-2 rounded-lg border p-3"
    >
      <IconFileText className="text-muted-foreground size-5" />
      <span className="text-primary text-sm underline">View attachment</span>
    </a>
  )
}
