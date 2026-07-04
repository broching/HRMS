"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { IconCheck, IconPaperclip } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { ClaimStatus } from "@/convex/lib/enums"
import { useCurrentMember } from "@/hooks/use-current-member"
import { hasPermission } from "@/convex/lib/permissions"
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/shared/page-header"
import {
  CLAIM_STATUS_BADGE,
  CLAIM_STATUS_LABELS,
  CLAIM_CATEGORY_LABELS,
  formatMoney,
} from "@/features/claims/lib/labels"

type ClaimDoc = FunctionReturnType<typeof api.claims.get>

// The status timeline reflects the claim's actual configured process (`flow`),
// so a claim without a finance stage never shows "Pending finance".
function StatusTimeline({
  flow,
  status,
}: {
  flow: ClaimStatus[]
  status: ClaimStatus
}) {
  const idx = flow.indexOf(status)
  const terminal = status === "rejected" || status === "cancelled"
  return (
    <div className="flex flex-wrap items-center gap-2">
      {flow.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <span
            className={cn(
              "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs",
              !terminal && i <= idx
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground",
            )}
          >
            {!terminal && i < idx && <IconCheck className="size-3" />}
            {CLAIM_STATUS_LABELS[s]}
          </span>
          {i < flow.length - 1 && (
            <span className="text-muted-foreground">→</span>
          )}
        </div>
      ))}
      {terminal && (
        <Badge variant={CLAIM_STATUS_BADGE[status]}>
          {CLAIM_STATUS_LABELS[status]}
        </Badge>
      )}
    </div>
  )
}

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
  const [busy, setBusy] = React.useState(false)

  const role = member?.role
  const isFinance = role ? hasPermission(role, "claims:approve:finance") : false
  // The claimant can confirm reimbursement themselves — unless it's already
  // queued for payroll, in which case reimbursement flows through the run and
  // only finance should close it out.
  const canReimburse = isFinance || (claim.isMine && !claim.sentToPayroll)
  const canCancel = claim.isMine || isFinance

  const cancel = useMutation(api.claims.cancel)

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
  const showCancel = isPending && canCancel

  if (
    !showApprovalActions &&
    !showReimburse &&
    !showPayrollToggle &&
    !showCancel &&
    !(claim.status === "approved" && claim.sentToPayroll)
  ) {
    return null
  }

  // At the finance stage the approving mutation differs from the chain stage.
  const approve = () =>
    claim.status === "pending_finance"
      ? financeApprove({ claimId })
      : managerApprove({ claimId })

  return (
    <div className="flex flex-wrap gap-2">
      {showApprovalActions && (
        <>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => run(approve(), "Claim approved")}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => run(reject({ claimId }), "Claim rejected")}
          >
            Reject
          </Button>
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
      {showCancel && (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => run(cancel({ claimId }), "Claim cancelled")}
        >
          Cancel
        </Button>
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
  return (
    <div className="flex flex-col gap-4">
      <StatusTimeline flow={claim.flow} status={claim.status} />

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
              {s.current && (
                <Badge variant="secondary" className="text-[10px]">
                  Awaiting
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category" value={CLAIM_CATEGORY_LABELS[claim.category]} />
        <Field
          label="Amount"
          value={formatMoney(claim.amountCents, claim.currency)}
        />
        {claim.localAmountCents !== null && claim.localCurrency && (
          <Field
            label="Local currency amount"
            value={formatMoney(claim.localAmountCents, claim.localCurrency)}
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
        {claim.decisionNote && (
          <Field label="Decision note" value={claim.decisionNote} />
        )}
      </div>

      {claim.receiptUrls.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">Receipts</span>
          {claim.receiptUrls.map((url, i) => (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-sm hover:underline"
            >
              <IconPaperclip className="size-3.5" />
              Receipt {i + 1}
            </a>
          ))}
        </div>
      )}

      <ClaimActions claim={claim} claimId={claimId} onDone={onDone} />
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
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
