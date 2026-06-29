"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import {
  IconCalendarEvent,
  IconCheck,
  IconX,
  IconInfoCircle,
  IconPencil,
  IconTrash,
  IconPaperclip,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import {
  LEAVE_STATUS_LABELS,
  LEAVE_STATUS_BADGE,
  formatDate,
  timelineLabel,
  relativeTime,
} from "@/features/leave-admin/lib/labels"
import { ModifyLeaveDialog } from "./modify-leave-dialog"

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function LeaveDetailPanel({
  requestId,
  onClose,
}: {
  requestId: Id<"leaveRequests"> | null
  onClose: () => void
}) {
  const detail = useQuery(
    api.leaveRequests.get,
    requestId ? { requestId } : "skip",
  )
  const approve = useMutation(api.leaveRequests.approve)
  const reject = useMutation(api.leaveRequests.reject)
  const requireInfo = useMutation(api.leaveRequests.requireInfo)
  const cancel = useMutation(api.leaveRequests.cancel)
  const remove = useMutation(api.leaveRequests.deleteRequest)

  const [mode, setMode] = React.useState<"reject" | "info" | null>(null)
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)

  React.useEffect(() => {
    // Reset transient action state when switching requests.
    setMode(null)
    setNote("")
  }, [requestId])

  async function run(p: Promise<unknown>, ok: string, close = false) {
    setBusy(true)
    try {
      await p
      toast.success(ok)
      setMode(null)
      setNote("")
      if (close) onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={!!requestId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md">
        {detail === undefined ? (
          <div className="flex flex-col gap-4 p-6">
            <Skeleton className="h-10 w-48" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : detail === null ? (
          <div className="p-6">
            <SheetHeader className="p-0">
              <SheetTitle>Leave details</SheetTitle>
            </SheetHeader>
            <p className="text-muted-foreground mt-4 text-sm">
              This request is no longer available.
            </p>
          </div>
        ) : (
          <>
            <SheetHeader className="border-b p-6 pb-4">
              <SheetTitle>Leave Details ({formatDate(detail.startDate)})</SheetTitle>
              <div className="mt-2 flex items-center gap-3">
                <Avatar className="size-10">
                  <AvatarImage src={detail.employeePhotoUrl ?? undefined} />
                  <AvatarFallback>{initials(detail.employeeName)}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="font-medium">{detail.employeeName}</span>
                  <span className="text-muted-foreground text-xs">
                    {detail.departmentName ?? detail.positionTitle ?? "—"}
                  </span>
                </div>
              </div>
              {detail.canManage && (
                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  <button
                    className="text-primary flex items-center gap-1 hover:underline"
                    onClick={() => setEditOpen(true)}
                  >
                    <IconPencil className="size-4" /> Modify Leave
                  </button>
                  <button
                    className="flex items-center gap-1 text-amber-600 hover:underline disabled:opacity-50"
                    disabled={busy}
                    onClick={() =>
                      run(cancel({ requestId: detail._id }), "Leave cancelled")
                    }
                  >
                    <IconX className="size-4" /> Cancel leave
                  </button>
                  <button
                    className="text-destructive flex items-center gap-1 hover:underline disabled:opacity-50"
                    disabled={busy}
                    onClick={() => setDeleteOpen(true)}
                  >
                    <IconTrash className="size-4" /> Delete leave
                  </button>
                </div>
              )}
            </SheetHeader>

            <div className="flex flex-col gap-4 p-6">
              <Field label="Leave type">
                <span className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: detail.leaveTypeColor }}
                  />
                  {detail.leaveTypeName}
                </span>
              </Field>
              <Field label="No. of days">{detail.totalDays} day(s)</Field>
              <Field label="Start Date">
                <span className="flex items-center gap-1.5">
                  <IconCalendarEvent className="text-muted-foreground size-4" />
                  {formatDate(detail.startDate)}
                  {detail.endDate !== detail.startDate &&
                    ` – ${formatDate(detail.endDate)}`}
                </span>
              </Field>
              <Field label="Status">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    LEAVE_STATUS_BADGE[detail.status],
                  )}
                >
                  {LEAVE_STATUS_LABELS[detail.status]}
                </span>
              </Field>
              <Field label="1st Approver">
                {detail.firstApproverName ?? "—"}
              </Field>
              {detail.secondApproverName && (
                <Field label="2nd Approver">{detail.secondApproverName}</Field>
              )}
              <Field label="Attachment">
                {detail.attachmentUrl ? (
                  <a
                    href={detail.attachmentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary flex items-center gap-1 hover:underline"
                  >
                    <IconPaperclip className="size-4" /> View attachment
                  </a>
                ) : (
                  <span className="text-muted-foreground">No attachment</span>
                )}
              </Field>
              <Field label="Justification">
                {detail.reason || (
                  <span className="text-muted-foreground">No justification</span>
                )}
              </Field>

              {detail.canApprove && (
                <div className="flex flex-col gap-3">
                  {mode && (
                    <Textarea
                      placeholder={
                        mode === "reject"
                          ? "Reason for rejection (optional)"
                          : "What information do you need?"
                      }
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  )}
                  <div className="flex flex-wrap gap-2">
                    {mode === null ? (
                      <>
                        <Button
                          className="bg-emerald-600 hover:bg-emerald-700"
                          disabled={busy}
                          onClick={() =>
                            run(
                              approve({ requestId: detail._id }),
                              "Leave approved",
                            )
                          }
                        >
                          <IconCheck className="size-4" /> Approve
                        </Button>
                        <Button
                          variant="destructive"
                          disabled={busy}
                          onClick={() => setMode("reject")}
                        >
                          <IconX className="size-4" /> Reject
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => setMode("info")}
                        >
                          <IconInfoCircle className="size-4" /> Require info
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          disabled={busy || (mode === "info" && !note.trim())}
                          onClick={() =>
                            mode === "reject"
                              ? run(
                                  reject({
                                    requestId: detail._id,
                                    note: note.trim() || undefined,
                                  }),
                                  "Leave rejected",
                                )
                              : run(
                                  requireInfo({
                                    requestId: detail._id,
                                    note: note.trim(),
                                  }),
                                  "Requested more info",
                                )
                          }
                        >
                          Confirm
                        </Button>
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() => {
                            setMode(null)
                            setNote("")
                          }}
                        >
                          Back
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}

              <Separator />

              <div>
                <h4 className="mb-3 flex items-center gap-2 text-sm font-medium">
                  Timeline
                </h4>
                <ol className="flex flex-col gap-3">
                  {[...detail.timeline]
                    .reverse()
                    .map((ev, i) => (
                      <li key={i} className="flex gap-3 text-sm">
                        <span className="bg-primary mt-1.5 size-2 shrink-0 rounded-full" />
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {timelineLabel(ev.type)}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {ev.actorName ? `${ev.actorName} · ` : ""}
                            {relativeTime(ev.at)}
                          </span>
                          {ev.note && (
                            <span className="text-muted-foreground mt-0.5 text-xs">
                              “{ev.note}”
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  {detail.timeline.length === 0 && (
                    <li className="text-muted-foreground text-xs">
                      No activity yet.
                    </li>
                  )}
                </ol>
              </div>
            </div>

            {detail.canManage && (
              <ModifyLeaveDialog
                requestId={detail._id}
                open={editOpen}
                onOpenChange={setEditOpen}
                initial={{
                  leaveTypeId: detail.leaveTypeId,
                  startDate: detail.startDate,
                  endDate: detail.endDate,
                  reason: detail.reason ?? "",
                }}
              />
            )}

            <ConfirmDialog
              open={deleteOpen}
              onOpenChange={setDeleteOpen}
              title="Delete this leave request?"
              description="This permanently removes the request and reverses its balance. This cannot be undone."
              confirmLabel="Delete leave"
              destructive
              onConfirm={() =>
                run(remove({ requestId: detail._id }), "Leave deleted", true)
              }
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-start gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}
