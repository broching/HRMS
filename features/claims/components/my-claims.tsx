"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { IconSearch } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { ClaimStatus } from "@/convex/lib/enums"
import { getErrorMessage } from "@/lib/errors"
import { ClaimDetailDialog } from "@/features/claims/components/claim-detail"
import { ClaimEditLauncher } from "@/features/claims/components/claim-edit-dialog"
import { ConfirmDialog } from "@/features/claims/components/confirm-dialog"
import { MonthNav } from "@/features/claims/components/month-nav"
import { SubmitClaimDialog } from "@/features/claims/components/submit-claim-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { Skeleton } from "@/components/ui/skeleton"
import {
  CLAIM_STATUS_BADGE,
  CLAIM_STATUS_LABELS,
  currentMonth,
  formatMoney,
  monthLabel,
} from "@/features/claims/lib/labels"

const ALL = "all"
// Statuses the owner can filter by (drafts included; "cancelled" is legacy).
const STATUSES: ClaimStatus[] = [
  "draft",
  "pending_manager",
  "pending_finance",
  "approved",
  "rejected",
  "reimbursed",
]

export function MyClaims() {
  const [month, setMonth] = React.useState(currentMonth())
  const claims = useQuery(api.claims.mine)
  const batches = useQuery(api.claims.myBatches) ?? []
  const claimTypes = useQuery(api.claimTypes.list, { includeInactive: true }) ?? []
  const del = useMutation(api.claims.deleteClaim)
  const submitMonth = useMutation(api.claims.submitMonth)
  const resubmit = useMutation(api.claims.resubmitClaims)

  const [typeId, setTypeId] = React.useState(ALL)
  const [status, setStatus] = React.useState(ALL)
  const [search, setSearch] = React.useState("")
  const [openId, setOpenId] = React.useState<Id<"claims"> | null>(null)
  const [editId, setEditId] = React.useState<Id<"claims"> | null>(null)
  const [deleteId, setDeleteId] = React.useState<Id<"claims"> | null>(null)
  const [submitAllOpen, setSubmitAllOpen] = React.useState(false)
  const [resubmitOpen, setResubmitOpen] = React.useState(false)
  const [selected, setSelected] = React.useState<Set<Id<"claims">>>(new Set())
  const [busy, setBusy] = React.useState(false)

  // Reset the resubmit selection whenever the month changes.
  React.useEffect(() => {
    setSelected(new Set())
  }, [month])

  const typeNameById = new Map(claimTypes.map((t) => [t._id, t.name]))

  const monthClaims = (claims ?? [])
    .filter((c) => c.incurredDate.startsWith(month))
    .filter((c) => {
      if (typeId !== ALL && typeNameById.get(typeId as Id<"claimTypes">) !== c.claimTypeName)
        return false
      if (status !== ALL && c.status !== status) return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const hay = `${c.claimTypeName} ${c.description}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    .sort((a, b) => (a.incurredDate < b.incurredDate ? 1 : -1))

  const draftCount = (claims ?? []).filter(
    (c) => c.status === "draft" && c.incurredDate.startsWith(month),
  ).length
  const monthTotal = monthClaims.reduce((s, c) => s + c.amountCents, 0)
  const monthCurrency = monthClaims[0]?.currency ?? "SGD"

  // Group the month's claims by the batch (claim group) they were submitted in,
  // so the claimant sees their claims organised by submission. Drafts (no group)
  // are bucketed on their own as "Not yet submitted" and shown first.
  const batchById = new Map(batches.map((b) => [b._id, b]))
  const DRAFT_BUCKET = "__drafts__"
  const buckets = React.useMemo(() => {
    const map = new Map<string, typeof monthClaims>()
    for (const c of monthClaims) {
      const key = c.groupId ?? DRAFT_BUCKET
      const arr = map.get(key)
      if (arr) arr.push(c)
      else map.set(key, [c])
    }
    const entries = [...map.entries()]
    // Drafts first, then batches by most-recent submission.
    entries.sort(([ka], [kb]) => {
      if (ka === DRAFT_BUCKET) return -1
      if (kb === DRAFT_BUCKET) return 1
      const sa = batchById.get(ka as Id<"claimGroups">)?.submittedAt ?? 0
      const sb = batchById.get(kb as Id<"claimGroups">)?.submittedAt ?? 0
      return sb - sa
    })
    return entries
  }, [monthClaims, batchById])

  function bucketLabel(key: string): string {
    if (key === DRAFT_BUCKET) return "Not yet submitted"
    const b = batchById.get(key as Id<"claimGroups">)
    if (!b) return "Submitted"
    const base = monthLabel(b.periodMonth)
    return b.title ? `${base} · ${b.title}` : base
  }

  // Rejected claims in the month can be bundled into a fresh submission group.
  function toggleSelected(id: Id<"claims">) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleDelete() {
    if (!deleteId) return
    setBusy(true)
    try {
      await del({ claimId: deleteId })
      toast.success("Claim deleted")
      setDeleteId(null)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't delete this claim"))
    } finally {
      setBusy(false)
    }
  }

  async function handleSubmitAll() {
    setBusy(true)
    try {
      const { submitted } = await submitMonth({ month })
      toast.success(
        `Submitted ${submitted} claim${submitted === 1 ? "" : "s"} for approval`,
      )
      setSubmitAllOpen(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't submit claims"))
    } finally {
      setBusy(false)
    }
  }

  async function handleResubmit() {
    setBusy(true)
    try {
      const { duplicated } = await resubmit({ claimIds: [...selected] })
      toast.success(
        `Duplicated ${duplicated} claim${duplicated === 1 ? "" : "s"} as draft${duplicated === 1 ? "" : "s"}. Edit if needed, then submit.`,
      )
      setResubmitOpen(false)
      setSelected(new Set())
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't resubmit claims"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Month + batch actions */}
      <div className="flex flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between lg:px-6">
        <MonthNav month={month} onChange={setMonth} />
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <Button variant="outline" onClick={() => setResubmitOpen(true)}>
              Duplicate to resubmit ({selected.size})
            </Button>
          )}
          {draftCount > 0 && (
            <Button variant="outline" onClick={() => setSubmitAllOpen(true)}>
              Submit all ({draftCount})
            </Button>
          )}
          <SubmitClaimDialog month={month} />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 px-4 lg:flex-row lg:items-center lg:px-6">
        <Select value={typeId} onValueChange={setTypeId}>
          <SelectTrigger className="w-full lg:w-48">
            <SelectValue placeholder="All claim types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All claim types</SelectItem>
            {claimTypes.map((t) => (
              <SelectItem key={t._id} value={t._id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full lg:w-44">
            <SelectValue placeholder="All status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All status</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {CLAIM_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative lg:max-w-xs lg:flex-1">
          <IconSearch className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search type / description"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="mx-4 rounded-lg border lg:mx-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Type</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {claims === undefined ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : monthClaims.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-muted-foreground py-8 text-center"
                >
                  No claims for {monthLabel(month)}.
                </TableCell>
              </TableRow>
            ) : (
              buckets.map(([key, rows]) => {
                const bucketTotal = rows.reduce((s, c) => s + c.amountCents, 0)
                const bucketCurrency = rows[0]?.currency ?? monthCurrency
                return (
                  <React.Fragment key={key}>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={6} className="py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">
                            {bucketLabel(key)}
                            <span className="text-muted-foreground ml-2 font-normal">
                              · {rows.length} claim{rows.length === 1 ? "" : "s"}
                            </span>
                          </span>
                          <span className="text-muted-foreground text-xs tabular-nums">
                            {formatMoney(bucketTotal, bucketCurrency)}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                    {rows.map((c) => (
                      <TableRow
                        key={c._id}
                        className="hover:bg-muted/50 cursor-pointer"
                        onClick={() => setOpenId(c._id)}
                      >
                        <TableCell
                          className="w-10"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {c.status === "rejected" && (
                            <input
                              type="checkbox"
                              className="size-4 cursor-pointer align-middle"
                              aria-label="Select for resubmission"
                              checked={selected.has(c._id)}
                              onChange={() => toggleSelected(c._id)}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">{c.claimTypeName}</span>
                          <div className="text-muted-foreground max-w-[280px] truncate text-xs">
                            {c.description}
                          </div>
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatMoney(c.amountCents, c.currency)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {c.incurredDate}
                        </TableCell>
                        <TableCell>
                          <Badge variant={CLAIM_STATUS_BADGE[c.status]}>
                            {CLAIM_STATUS_LABELS[c.status]}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div
                            className="flex justify-end gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {c.status === "draft" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setEditId(c._id)}
                              >
                                Edit
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setOpenId(c._id)}
                            >
                              View
                            </Button>
                            {(c.status === "draft" ||
                              c.status === "rejected") && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-destructive"
                                onClick={() => setDeleteId(c._id)}
                              >
                                Delete
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </React.Fragment>
                )
              })
            )}
          </TableBody>
        </Table>
        {monthClaims.length > 0 && (
          <div className="text-muted-foreground flex justify-end gap-1 border-t px-4 py-2 text-sm">
            <span>{monthLabel(month)} total:</span>
            <span className="text-foreground font-semibold tabular-nums">
              {formatMoney(monthTotal, monthCurrency)}
            </span>
          </div>
        )}
      </div>

      <ClaimDetailDialog
        claimId={openId}
        open={openId !== null}
        onOpenChange={(o) => !o && setOpenId(null)}
      />
      <ClaimEditLauncher
        claimId={editId}
        open={editId !== null}
        onOpenChange={(o) => !o && setEditId(null)}
      />
      <ConfirmDialog
        open={deleteId !== null}
        onOpenChange={(o) => !o && setDeleteId(null)}
        title="Delete claim?"
        description="This permanently removes the claim and its attachments. This can't be undone."
        confirmLabel="Delete"
        destructive
        busy={busy}
        onConfirm={handleDelete}
      />
      <ConfirmDialog
        open={submitAllOpen}
        onOpenChange={setSubmitAllOpen}
        title="Submit all drafts?"
        description={`Submit ${draftCount} draft claim${draftCount === 1 ? "" : "s"} for ${monthLabel(month)} into the approval workflow. You won't be able to edit them afterwards.`}
        confirmLabel="Submit all"
        busy={busy}
        onConfirm={handleSubmitAll}
      />
      <ConfirmDialog
        open={resubmitOpen}
        onOpenChange={setResubmitOpen}
        title="Duplicate for resubmission?"
        description={`This creates ${selected.size === 1 ? "a fresh draft copy" : `${selected.size} fresh draft copies`} of the selected rejected claim${selected.size === 1 ? "" : "s"}. The original rejected claim${selected.size === 1 ? " stays" : "s stay"} on record; you can edit the ${selected.size === 1 ? "copy" : "copies"} before submitting ${selected.size === 1 ? "it" : "them"} again.`}
        confirmLabel="Duplicate"
        busy={busy}
        onConfirm={handleResubmit}
      />
    </div>
  )
}
