"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { IconCheck, IconPaperclip } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useCurrentMember } from "@/hooks/use-current-member"
import { hasPermission } from "@/convex/lib/permissions"
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
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/shared/page-header"
import {
  CLAIM_FLOW,
  CLAIM_STATUS_BADGE,
  CLAIM_STATUS_LABELS,
  CLAIM_CATEGORY_LABELS,
  formatMoney,
} from "@/features/claims/lib/labels"

function StatusTimeline({ status }: { status: string }) {
  const idx = CLAIM_FLOW.indexOf(status as (typeof CLAIM_FLOW)[number])
  const terminal = status === "rejected" || status === "cancelled"
  return (
    <div className="flex flex-wrap items-center gap-2">
      {CLAIM_FLOW.map((s, i) => (
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
          {i < CLAIM_FLOW.length - 1 && (
            <span className="text-muted-foreground">→</span>
          )}
        </div>
      ))}
      {terminal && (
        <Badge variant={CLAIM_STATUS_BADGE[status as never]}>
          {CLAIM_STATUS_LABELS[status as never]}
        </Badge>
      )}
    </div>
  )
}

export function ClaimDetail({ claimId }: { claimId: Id<"claims"> }) {
  const claim = useQuery(api.claims.get, { claimId })
  const comments = useQuery(api.claims.listComments, { claimId })
  const member = useCurrentMember()

  const managerApprove = useMutation(api.claims.managerApprove)
  const financeApprove = useMutation(api.claims.financeApprove)
  const reject = useMutation(api.claims.reject)
  const markReimbursed = useMutation(api.claims.markReimbursed)
  const cancel = useMutation(api.claims.cancel)
  const setSentToPayroll = useMutation(api.claims.setSentToPayroll)
  const addComment = useMutation(api.claims.addComment)

  const [comment, setComment] = React.useState("")

  const role = member?.role
  const isFinance = role ? hasPermission(role, "claims:approve:finance") : false
  const isApprover = role === "manager" || role === "hr" || role === "admin"

  async function run(p: Promise<unknown>, ok: string) {
    try {
      await p
      toast.success(ok)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed")
    }
  }

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
            <CardContent className="flex flex-col gap-4">
              <StatusTimeline status={claim.status} />

              {claim.approvalChain.length > 0 && (
                <div className="flex flex-col gap-1.5 rounded-lg border p-3">
                  <span className="text-muted-foreground text-xs">
                    Approval chain
                  </span>
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
                      <span className={cn(s.current && "font-medium")}>
                        {s.label}
                      </span>
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
                {claim.receiptNo && (
                  <Field label="Receipt No" value={claim.receiptNo} />
                )}
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

              <div className="flex flex-wrap gap-2">
                {claim.status === "pending_manager" && isApprover && (
                  <>
                    <Button
                      size="sm"
                      onClick={() =>
                        run(managerApprove({ claimId }), "Approved")
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => run(reject({ claimId }), "Rejected")}
                    >
                      Reject
                    </Button>
                  </>
                )}
                {claim.status === "pending_finance" && isFinance && (
                  <>
                    <Button
                      size="sm"
                      onClick={() =>
                        run(financeApprove({ claimId }), "Approved")
                      }
                    >
                      Approve (finance)
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => run(reject({ claimId }), "Rejected")}
                    >
                      Reject
                    </Button>
                  </>
                )}
                {claim.status === "approved" && isFinance && (
                  <>
                    <Button
                      size="sm"
                      onClick={() =>
                        run(markReimbursed({ claimId }), "Marked reimbursed")
                      }
                    >
                      Mark reimbursed
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        run(
                          setSentToPayroll({
                            claimId,
                            value: !claim.sentToPayroll,
                          }),
                          claim.sentToPayroll
                            ? "Removed from payroll"
                            : "Queued for payroll",
                        )
                      }
                    >
                      {claim.sentToPayroll
                        ? "Remove from payroll"
                        : "Send to payroll"}
                    </Button>
                  </>
                )}
                {claim.status === "approved" && claim.sentToPayroll && (
                  <Badge variant="secondary" className="self-center">
                    Queued for payroll
                  </Badge>
                )}
                {(claim.status === "pending_manager" ||
                  claim.status === "pending_finance") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => run(cancel({ claimId }), "Cancelled")}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Comments</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-3">
              {comments === undefined ? (
                <Skeleton className="h-6 w-full" />
              ) : comments.length === 0 ? (
                <p className="text-muted-foreground text-sm">No comments.</p>
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
                  } catch {
                    toast.error("Could not add comment")
                  }
                }}
              >
                Comment
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
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
