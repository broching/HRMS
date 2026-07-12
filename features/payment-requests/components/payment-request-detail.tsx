"use client"

import * as React from "react"
import { useQuery, useMutation, useConvex } from "convex/react"
import {
  IconExternalLink,
  IconPaperclip,
  IconCheck,
  IconCircle,
  IconSend,
  IconPencil,
  IconTrash,
  IconDownload,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { getErrorMessage } from "@/lib/errors"
import { countryName } from "@/lib/countries"
import {
  PR_STATUS_LABELS,
  PR_STATUS_BADGE,
  requestRef,
  formatMoney,
} from "@/features/payment-requests/lib/labels"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SignatureCaptureDialog } from "@/features/payroll/components/signature-pad"
import { EditPaymentRequestDialog } from "@/features/payment-requests/components/edit-payment-request-dialog"
import {
  buildRequestPdf,
  downloadBlob,
} from "@/features/payment-requests/lib/payment-request-pdf"

function AttachmentPreview({
  url,
  contentType,
  index,
}: {
  url: string
  contentType: string | null
  index: number
}) {
  const isImage = contentType?.startsWith("image/")
  const isPdf = contentType === "application/pdf"
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs">
          Document {index + 1}
        </span>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-primary flex items-center gap-1 text-xs hover:underline"
        >
          <IconExternalLink className="size-3" />
          Open
        </a>
      </div>
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={`Document ${index + 1}`}
          className="max-h-72 w-full rounded-md border object-contain"
        />
      ) : isPdf ? (
        <object data={url} type="application/pdf" className="h-72 w-full rounded-md border">
          <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1 p-2 text-sm hover:underline">
            <IconPaperclip className="size-3.5" />
            Open PDF
          </a>
        </object>
      ) : (
        <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-md border p-2 text-sm hover:underline">
          <IconPaperclip className="size-3.5" />
          Open attachment
        </a>
      )}
    </div>
  )
}

export function PaymentRequestDetailDialog({
  requestId,
  open,
  onOpenChange,
}: {
  requestId: Id<"paymentRequests"> | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const request = useQuery(
    api.paymentRequests.get,
    requestId ? { requestId } : "skip",
  )
  const comments = useQuery(
    api.paymentRequests.listComments,
    requestId ? { requestId } : "skip",
  )
  const approve = useMutation(api.paymentRequests.approve)
  const reject = useMutation(api.paymentRequests.reject)
  const submitDraft = useMutation(api.paymentRequests.submitRequest)
  const markPaid = useMutation(api.paymentRequests.markPaid)
  const deleteRequest = useMutation(api.paymentRequests.deleteRequest)
  const addComment = useMutation(api.paymentRequests.addComment)
  const generateUpload = useMutation(api.paymentRequests.generateUploadUrl)
  const convex = useConvex()

  const [rejecting, setRejecting] = React.useState(false)
  const [rejectNote, setRejectNote] = React.useState("")
  const [sigOpen, setSigOpen] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)
  const [comment, setComment] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!open) {
      setRejecting(false)
      setRejectNote("")
    }
  }, [open])

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true)
    try {
      await fn()
      toast.success(ok)
    } catch (e) {
      toast.error(getErrorMessage(e, "Something went wrong"))
    } finally {
      setBusy(false)
    }
  }

  async function downloadPdf(withAttachments: boolean) {
    if (!requestId) return
    setBusy(true)
    try {
      const prints = await convex.query(api.paymentRequests.getForPrint, {
        requestIds: [requestId],
      })
      if (prints.length === 0) throw new Error("Nothing to download.")
      const blob = await buildRequestPdf(prints[0], withAttachments)
      downloadBlob(
        `${prints[0].employeeName} — payment request${withAttachments ? " + docs" : ""}.pdf`,
        blob,
      )
      toast.success("PDF ready")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't build the PDF"))
    } finally {
      setBusy(false)
    }
  }

  const loading = request === undefined && requestId != null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[95vw] overflow-y-auto sm:max-w-2xl">
        {loading || !request ? (
          <div className="text-muted-foreground py-12 text-center text-sm">
            {loading ? "Loading…" : "Payment request not found."}
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <DialogTitle>{requestRef(request.requestNumber)}</DialogTitle>
                <Badge variant={PR_STATUS_BADGE[request.status]}>
                  {PR_STATUS_LABELS[request.status]}
                </Badge>
              </div>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              {/* Core summary */}
              <div className="grid gap-2 text-sm">
                <Row label="Requestor" value={request.employeeName} />
                <Row label="Date" value={request.requestDate} />
                <Row label="Purpose" value={request.purpose} />
                <Row
                  label="Amount"
                  value={
                    <span className="font-semibold">
                      {formatMoney(request.amountCents, request.currency)}
                    </span>
                  }
                />
                <Row label="Account / payee" value={request.payeeName} />
                {request.country && (
                  <Row label="Country" value={countryName(request.country)} />
                )}
                {request.templateFields.map((f) => {
                  const val = request.fieldValues[f.key]
                  if (!val) return null
                  return <Row key={f.key} label={f.label} value={val} />
                })}
                {request.remarks && <Row label="Remarks" value={request.remarks} />}
                {request.decisionNote && request.status === "rejected" && (
                  <Row
                    label="Rejection reason"
                    value={<span className="text-destructive">{request.decisionNote}</span>}
                  />
                )}
              </div>

              {/* Approval chain */}
              {request.approvalChain.length > 0 && (
                <div className="rounded-lg border p-3">
                  <p className="mb-2 text-xs font-medium">Approval chain</p>
                  <ol className="flex flex-col gap-1.5">
                    {request.approvalChain.map((s, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        {s.done ? (
                          <IconCheck className="size-4 text-emerald-600" />
                        ) : (
                          <IconCircle
                            className={cn(
                              "size-4",
                              s.current ? "text-primary" : "text-muted-foreground/40",
                            )}
                          />
                        )}
                        <span className={cn(s.current && "text-primary font-medium")}>
                          {s.label}
                        </span>
                        {s.current && (
                          <span className="text-muted-foreground text-xs">
                            · awaiting
                          </span>
                        )}
                      </li>
                    ))}
                    {request.requiresFinance && (
                      <li className="flex items-center gap-2 text-sm">
                        {request.status === "approved" || request.status === "paid" ? (
                          <IconCheck className="size-4 text-emerald-600" />
                        ) : (
                          <IconCircle
                            className={cn(
                              "size-4",
                              request.status === "pending_finance"
                                ? "text-primary"
                                : "text-muted-foreground/40",
                            )}
                          />
                        )}
                        <span
                          className={cn(
                            request.status === "pending_finance" && "text-primary font-medium",
                          )}
                        >
                          Finance
                        </span>
                      </li>
                    )}
                  </ol>
                </div>
              )}

              {/* Signatures */}
              {(request.requestorSignatureUrl || request.signatures.length > 0) && (
                <div className="rounded-lg border p-3">
                  <p className="mb-2 text-xs font-medium">Signatures</p>
                  <div className="flex flex-wrap gap-4">
                    {request.requestorSignatureUrl && (
                      <SignatureChip
                        role="Requested by"
                        name={request.employeeName}
                        url={request.requestorSignatureUrl}
                      />
                    )}
                    {request.signatures.map((s, i) => (
                      <SignatureChip key={i} role={s.role} name={s.name} url={s.url} />
                    ))}
                  </div>
                </div>
              )}

              {/* Attachments */}
              {request.attachments.length > 0 && (
                <div className="grid gap-3">
                  <p className="text-xs font-medium">
                    Supporting documents ({request.attachments.length})
                  </p>
                  {request.attachments.map((a, i) => (
                    <AttachmentPreview
                      key={a.storageId}
                      url={a.url}
                      contentType={a.contentType}
                      index={i}
                    />
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline" disabled={busy}>
                      <IconDownload className="size-4" />
                      Download PDF
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => downloadPdf(false)}>
                      Form only
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => downloadPdf(true)}
                      disabled={request.attachments.length === 0}
                    >
                      Form + supporting documents
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {request.isMine && request.status === "draft" && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      run(() => submitDraft({ requestId: request._id }), "Submitted")
                    }
                  >
                    <IconSend className="size-4" />
                    Submit
                  </Button>
                )}
                {request.canResubmit && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => submitDraft({ requestId: request._id }),
                        "Resubmitted",
                      )
                    }
                  >
                    <IconSend className="size-4" />
                    Resubmit
                  </Button>
                )}
                {request.canApprove && !rejecting && (
                  <>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        if (request.needsSignature) setSigOpen(true)
                        else
                          run(
                            () => approve({ requestId: request._id }),
                            "Approved",
                          )
                      }}
                    >
                      <IconCheck className="size-4" />
                      {request.needsSignature ? "Approve & sign" : "Approve"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setRejecting(true)}
                    >
                      Reject
                    </Button>
                  </>
                )}
                {request.canEdit && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setEditOpen(true)}
                  >
                    <IconPencil className="size-4" />
                    Edit
                  </Button>
                )}
                {request.status === "approved" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      run(() => markPaid({ requestId: request._id }), "Marked paid")
                    }
                  >
                    Mark paid
                  </Button>
                )}
                {((request.isMine && request.status === "draft") ||
                  (request.canApprove &&
                    (request.status === "pending_manager" ||
                      request.status === "pending_finance"))) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await deleteRequest({ requestId: request._id })
                        onOpenChange(false)
                      }, "Deleted")
                    }
                  >
                    <IconTrash className="size-4" />
                    Delete
                  </Button>
                )}
              </div>

              {rejecting && (
                <div className="grid gap-2 rounded-lg border p-3">
                  <p className="text-sm font-medium">Reject request</p>
                  <Textarea
                    rows={2}
                    placeholder="Reason for rejection (required)"
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={busy || !rejectNote.trim()}
                      onClick={() =>
                        run(async () => {
                          await reject({ requestId: request._id, note: rejectNote.trim() })
                          setRejecting(false)
                          setRejectNote("")
                        }, "Rejected")
                      }
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              )}

              {/* Comments */}
              <div className="grid gap-2 border-t pt-3">
                <p className="text-xs font-medium">Comments</p>
                {comments?.length === 0 && (
                  <p className="text-muted-foreground text-xs">No comments yet.</p>
                )}
                {comments?.map((c) => (
                  <div key={c._id} className="text-sm">
                    <span className="font-medium">{c.authorName}</span>{" "}
                    <span className="text-muted-foreground">{c.body}</span>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input
                    placeholder="Add a comment"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !comment.trim()}
                    onClick={() =>
                      run(async () => {
                        await addComment({ requestId: request._id, body: comment.trim() })
                        setComment("")
                      }, "Comment added")
                    }
                  >
                    Post
                  </Button>
                </div>
              </div>
            </div>

            <SignatureCaptureDialog
              open={sigOpen}
              onOpenChange={setSigOpen}
              title="Sign to approve"
              confirmLabel="Approve & sign"
              getUploadUrl={() => generateUpload()}
              onSigned={async (storageId) => {
                await approve({
                  requestId: request._id,
                  signatureStorageId: storageId as Id<"_storage">,
                })
                toast.success("Approved")
              }}
            />
            <EditPaymentRequestDialog
              requestId={request._id}
              open={editOpen}
              onOpenChange={setEditOpen}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-words">{value}</span>
    </div>
  )
}

function SignatureChip({
  role,
  name,
  url,
}: {
  role: string
  name: string
  url: string | null
}) {
  return (
    <div className="flex flex-col gap-1">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={role} className="h-12 w-32 rounded border bg-white object-contain" />
      ) : (
        <div className="h-12 w-32 rounded border" />
      )}
      <span className="text-xs font-medium">{name}</span>
      <span className="text-muted-foreground text-[11px]">{role}</span>
    </div>
  )
}
