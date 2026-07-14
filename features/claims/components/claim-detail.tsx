"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import {
  IconCheck,
  IconPaperclip,
  IconExternalLink,
  IconPencil,
  IconZoomIn,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useCurrentMember } from "@/hooks/use-current-member"
import { getErrorMessage } from "@/lib/errors"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/shared/page-header"
import { DocumentViewer } from "@/components/shared/document-viewer"
import {
  CLAIM_STATUS_BADGE,
  CLAIM_STATUS_LABELS,
  CLAIM_CATEGORY_LABELS,
  formatMoney,
} from "@/features/claims/lib/labels"
import { ClaimEditDialog } from "@/features/claims/components/claim-edit-dialog"
import { SignatureCaptureDialog } from "@/features/payroll/components/signature-pad"

type ClaimDoc = FunctionReturnType<typeof api.claims.get>

// The decision / lifecycle actions available on a claim, gated by the viewer's
// role and whether they own the claim. `onDone` (used by the dialog) closes the
// surrounding view after a successful action.
function ClaimActions({
  claim,
  claimId,
  onDone,
}: {
  claim: ClaimDoc
  claimId: Id<"claims">
  onDone?: () => void
}) {
  const member = useCurrentMember()
  const managerApprove = useMutation(api.claims.managerApprove)
  const financeApprove = useMutation(api.claims.financeApprove)
  const reject = useMutation(api.claims.reject)
  const markReimbursed = useMutation(api.claims.markReimbursed)
  const setSentToPayroll = useMutation(api.claims.setSentToPayroll)
  const getUploadUrl = useMutation(api.claims.generateUploadUrl)
  const [busy, setBusy] = React.useState(false)
  const [rejectOpen, setRejectOpen] = React.useState(false)
  const [rejectNote, setRejectNote] = React.useState("")
  const [signOpen, setSignOpen] = React.useState(false)

  const isFinance = !!member?.permissions?.includes("claims:approve:finance")
  // The claimant can confirm reimbursement themselves — unless it's already
  // queued for payroll, in which case reimbursement flows through the run and
  // only finance should close it out.
  const canReimburse = isFinance || (claim.isMine && !claim.sentToPayroll)

  async function run(p: Promise<unknown>, ok: string) {
    setBusy(true)
    try {
      await p
      toast.success(ok)
      onDone?.()
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't complete that action"))
    } finally {
      setBusy(false)
    }
  }

  const isPending =
    claim.status === "pending_manager" || claim.status === "pending_finance"
  const showApprovalActions = isPending && claim.canApprove
  const showReimburse = claim.status === "approved" && canReimburse
  const showPayrollToggle = claim.status === "approved" && isFinance

  if (
    !showApprovalActions &&
    !showReimburse &&
    !showPayrollToggle &&
    !(claim.status === "approved" && claim.sentToPayroll)
  ) {
    return null
  }

  // At the finance stage the approving mutation differs from the chain stage.
  // A signature is threaded through when the step requires one.
  const approve = (signatureStorageId?: Id<"_storage">) =>
    claim.status === "pending_finance"
      ? financeApprove({ claimId, signatureStorageId })
      : managerApprove({ claimId, signatureStorageId })

  return (
    <div className="flex flex-wrap gap-2">
      {showApprovalActions && (
        <>
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              claim.needsSignature
                ? setSignOpen(true)
                : run(approve(), "Claim approved")
            }
          >
            {claim.needsSignature ? "Approve & sign" : "Approve"}
          </Button>
          <SignatureCaptureDialog
            open={signOpen}
            onOpenChange={setSignOpen}
            title="Sign to approve claim"
            description="Your signature is recorded against this claim and rendered on the claim's Excel export."
            confirmLabel="Approve & sign"
            getUploadUrl={() => getUploadUrl({})}
            onSigned={async (storageId) => {
              await run(
                approve(storageId as Id<"_storage">),
                "Claim approved",
              )
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => setRejectOpen(true)}
          >
            Reject
          </Button>
          <Dialog open={rejectOpen} onOpenChange={(o) => !busy && setRejectOpen(o)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Reject claim</DialogTitle>
              </DialogHeader>
              <div className="grid gap-2">
                <Label>Reason (shared with the employee)</Label>
                <Textarea
                  rows={3}
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="Why is this claim being rejected?"
                />
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setRejectOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() =>
                    run(
                      reject({
                        claimId,
                        note: rejectNote.trim() || undefined,
                      }),
                      "Claim rejected",
                    )
                  }
                >
                  Reject claim
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
      {showReimburse && (
        <Button
          size="sm"
          disabled={busy}
          onClick={() =>
            run(markReimbursed({ claimId }), "Marked as reimbursed")
          }
        >
          Mark as reimbursed
        </Button>
      )}
      {showPayrollToggle && (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            run(
              setSentToPayroll({ claimId, value: !claim.sentToPayroll }),
              claim.sentToPayroll ? "Removed from payroll" : "Queued for payroll",
            )
          }
        >
          {claim.sentToPayroll ? "Remove from payroll" : "Send to payroll"}
        </Button>
      )}
      {claim.status === "approved" && claim.sentToPayroll && (
        <Badge variant="secondary" className="self-center">
          Queued for payroll
        </Badge>
      )}
    </div>
  )
}

// The core claim details: status timeline, approval chain, fields, receipts and
// actions. Shared by the full-page view and the in-context dialog.
function ClaimDetailsCard({
  claim,
  claimId,
  onDone,
}: {
  claim: ClaimDoc
  claimId: Id<"claims">
  onDone?: () => void
}) {
  const [editOpen, setEditOpen] = React.useState(false)
  return (
    <div className="flex flex-col gap-4">
      {claim.canEdit && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setEditOpen(true)}
          >
            <IconPencil className="size-3.5" />
            Edit
          </Button>
        </div>
      )}
      {claim.canEdit && (
        <ClaimEditDialog
          claim={claim}
          claimId={claimId}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}

      {claim.approvalChain.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-lg border p-3">
          <span className="text-muted-foreground text-xs">Approval chain</span>
          {claim.approvalChain.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span
                className={cn(
                  "flex size-4 items-center justify-center rounded-full border text-[10px]",
                  s.done
                    ? "border-primary bg-primary text-primary-foreground"
                    : s.current
                      ? "border-primary text-primary"
                      : "text-muted-foreground",
                )}
              >
                {s.done ? <IconCheck className="size-3" /> : i + 1}
              </span>
              <span className={cn(s.current && "font-medium")}>{s.label}</span>
              {s.current &&
                (claim.waitingForBatch ? (
                  <Badge variant="outline" className="text-[10px]">
                    Waiting for batch
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">
                    Awaiting
                  </Badge>
                ))}
            </div>
          ))}
          {claim.waitingForBatch && (
            <p className="text-muted-foreground mt-1 text-xs">
              This claim has cleared its steps early. It waits here until the rest
              of the batch reaches this approver, then the group moves on together.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category" value={CLAIM_CATEGORY_LABELS[claim.category]} />
        <Field
          label="Amount"
          value={formatMoney(claim.amountCents, claim.currency)}
        />
        {claim.mileageDistanceKm != null && (
          <Field
            label="Mileage"
            value={
              <span>
                {claim.mileageDistanceKm} km
                {claim.mileageVehicleTypeLabel
                  ? ` · ${claim.mileageVehicleTypeLabel}`
                  : ""}
                {claim.mileageRatePerKmCents != null && (
                  <span className="text-muted-foreground block text-xs">
                    {formatMoney(claim.mileageRatePerKmCents, claim.currency)}/km
                  </span>
                )}
              </span>
            }
          />
        )}
        {claim.localAmountCents !== null && claim.localCurrency && (
          <Field
            label="Original amount"
            value={formatMoney(claim.localAmountCents, claim.localCurrency)}
          />
        )}
        {claim.exchangeRate !== null && claim.localCurrency && (
          <Field
            label="Exchange rate"
            value={
              <span>
                1 {claim.localCurrency} = {claim.exchangeRate} {claim.currency}
                <span className="text-muted-foreground block text-xs">
                  {claim.exchangeMode === "auto" ? "Auto" : "Manual"}
                  {claim.exchangeProvider
                    ? ` · ${claim.exchangeProvider}`
                    : ""}
                  {claim.exchangeRateDate ? ` · ${claim.exchangeRateDate}` : ""}
                </span>
              </span>
            }
          />
        )}
        {claim.taxAmountCents !== null && (
          <Field
            label="Tax amount"
            value={formatMoney(claim.taxAmountCents, claim.currency)}
          />
        )}
        <Field label="Date incurred" value={claim.incurredDate} />
        {claim.receiptNo && <Field label="Receipt No" value={claim.receiptNo} />}
        <Field label="Description" value={claim.description} />
        {claim.remarks && <Field label="Remarks" value={claim.remarks} />}
        {claim.decisionNote && (
          <Field label="Decision note" value={claim.decisionNote} />
        )}
      </div>

      {claim.receipts.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-muted-foreground text-xs">
            Receipts ({claim.receipts.length})
          </span>
          <div className="grid gap-3 sm:grid-cols-2">
            {claim.receipts.map((r, i) => (
              <ReceiptPreview key={i} url={r.url} contentType={r.contentType} index={i} />
            ))}
          </div>
        </div>
      )}

      {claim.edits.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg border p-3">
          <span className="text-muted-foreground text-xs">Edit history</span>
          {claim.edits
            .slice()
            .reverse()
            .map((e, i) => (
              <div key={i} className="text-sm">
                <span className="font-medium">{e.editedByName}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {new Date(e.editedAt).toLocaleString()}
                </span>
                <p className="text-muted-foreground text-xs">{e.summary}</p>
              </div>
            ))}
        </div>
      )}

      <ClaimActions claim={claim} claimId={claimId} onDone={onDone} />
    </div>
  )
}

// One receipt rendered inline: images and PDFs show a preview; anything else
// falls back to a link. Images open a zoomable lightbox on click; every preview
// can also open the raw file in a new tab.
function ReceiptPreview({
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
  const [zoomOpen, setZoomOpen] = React.useState(false)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs">
          Receipt {index + 1}
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
        <>
          <button
            type="button"
            onClick={() => setZoomOpen(true)}
            className="group relative cursor-zoom-in"
            title="Click to zoom"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`Receipt ${index + 1}`}
              className="max-h-72 w-full rounded-md border object-contain"
            />
            <span className="bg-background/80 text-muted-foreground absolute right-1.5 bottom-1.5 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] opacity-0 transition-opacity group-hover:opacity-100">
              <IconZoomIn className="size-3" />
              Zoom
            </span>
          </button>
          <DocumentViewer
            url={url}
            title={`Receipt ${index + 1}`}
            fileName={`receipt-${index + 1}`}
            kind="image"
            open={zoomOpen}
            onOpenChange={setZoomOpen}
          />
        </>
      ) : isPdf ? (
        <object
          data={url}
          type="application/pdf"
          className="h-72 w-full rounded-md border"
        >
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 p-2 text-sm hover:underline"
          >
            <IconPaperclip className="size-3.5" />
            Open PDF
          </a>
        </object>
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 rounded-md border p-2 text-sm hover:underline"
        >
          <IconPaperclip className="size-3.5" />
          Open attachment
        </a>
      )}
    </div>
  )
}

function ClaimComments({ claimId }: { claimId: Id<"claims"> }) {
  const comments = useQuery(api.claims.listComments, { claimId })
  const addComment = useMutation(api.claims.addComment)
  const [comment, setComment] = React.useState("")

  return (
    <Card>
      <CardHeader>
        <CardTitle>Comments</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-3">
          {comments === undefined ? (
            <Skeleton className="h-6 w-full" />
          ) : comments.length === 0 ? (
            <p className="text-muted-foreground text-sm">No comments yet.</p>
          ) : (
            comments.map((c) => (
              <div key={c._id} className="text-sm">
                <span className="font-medium">{c.authorName}</span>
                <p className="text-muted-foreground">{c.body}</p>
              </div>
            ))
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Add a comment…"
            rows={2}
          />
          <Button
            size="sm"
            disabled={!comment.trim()}
            onClick={async () => {
              try {
                await addComment({ claimId, body: comment })
                setComment("")
              } catch (e) {
                toast.error(getErrorMessage(e, "Couldn't add comment"))
              }
            }}
          >
            Comment
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// Full-page claim view (route: /claims/[claimId]).
export function ClaimDetail({ claimId }: { claimId: Id<"claims"> }) {
  const claim = useQuery(api.claims.get, { claimId })

  if (claim === undefined) {
    return (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${claim.claimTypeName} · ${formatMoney(claim.amountCents, claim.currency)}`}
        description={`${claim.employeeName} · ${claim.incurredDate}`}
      >
        <Badge variant={CLAIM_STATUS_BADGE[claim.status]}>
          {CLAIM_STATUS_LABELS[claim.status]}
        </Badge>
      </PageHeader>

      <div className="grid gap-4 px-4 lg:grid-cols-3 lg:px-6">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <ClaimDetailsCard claim={claim} claimId={claimId} />
            </CardContent>
          </Card>
        </div>
        <ClaimComments claimId={claimId} />
      </div>
    </div>
  )
}

// In-context claim detail: opens as a dialog so the user stays in whichever
// section they came from (Team, HR Lounge, My claims) instead of navigating
// away. Actions close the dialog on success.
export function ClaimDetailDialog({
  claimId,
  open,
  onOpenChange,
}: {
  claimId: Id<"claims"> | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[95vw] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Claim details</DialogTitle>
        </DialogHeader>
        {claimId ? (
          <DialogBody claimId={claimId} onDone={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function DialogBody({
  claimId,
  onDone,
}: {
  claimId: Id<"claims">
  onDone: () => void
}) {
  const claim = useQuery(api.claims.get, { claimId })
  if (claim === undefined) return <Skeleton className="h-64 w-full" />
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-medium">
            {claim.claimTypeName} ·{" "}
            {formatMoney(claim.amountCents, claim.currency)}
          </p>
          <p className="text-muted-foreground text-sm">
            {claim.employeeName} · {claim.incurredDate}
          </p>
        </div>
        <Badge variant={CLAIM_STATUS_BADGE[claim.status]}>
          {CLAIM_STATUS_LABELS[claim.status]}
        </Badge>
      </div>
      <ClaimDetailsCard claim={claim} claimId={claimId} onDone={onDone} />
    </div>
  )
}

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm">{value || "—"}</span>
    </div>
  )
}
