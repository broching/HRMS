"use client"

import * as React from "react"
import { useQuery, useMutation, useConvex } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import {
  IconSearch,
  IconExternalLink,
  IconChevronRight,
  IconChevronDown,
  IconArrowLeft,
  IconMessage,
  IconDownload,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { getErrorMessage } from "@/lib/errors"
import { useCurrentMember } from "@/hooks/use-current-member"
import { ClaimDetailDialog } from "@/features/claims/components/claim-detail"
import { ClaimEditLauncher } from "@/features/claims/components/claim-edit-dialog"
import { ConfirmDialog } from "@/features/claims/components/confirm-dialog"
import { MonthNav } from "@/features/claims/components/month-nav"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import {
  buildClaimsListWorkbook,
  buildMonthlyTotalsWorkbook,
  buildClaimFormsZip,
  buildClaimFormWorkbook,
  downloadClaimBlob,
} from "@/features/claims/lib/claims-excel"
import { SignatureCaptureDialog } from "@/features/payroll/components/signature-pad"

type Group = FunctionReturnType<typeof api.claims.approvalClaimGroups>[number]
const ALL = "all"

// Export args shared by the flat-rows (`exportRows`) and per-employee form
// (`exportForms`) queries.
type ExportArgs = {
  source: "mine" | "all"
  month?: string
  departmentId?: Id<"departments">
  teamId?: Id<"teams">
  employeeId?: Id<"employees">
}

// Export dropdown. Fetches on demand (not held in a live subscription) and
// offers an Excel claims list with grand total + signatures, the monthly totals
// listing, and the staff-expense claim form(s). When scoped to a single employee
// it downloads one form; org-wide it zips one per employee.
function ExportMenu({
  label = "Export",
  filename,
  month,
  args,
  single,
}: {
  label?: string
  filename: string
  month: string
  args: ExportArgs
  single?: boolean
}) {
  const convex = useConvex()
  const [busy, setBusy] = React.useState(false)

  async function run(kind: "list" | "totals" | "forms") {
    setBusy(true)
    try {
      const groups = await convex.query(api.claims.exportForms, args)
      if (groups.length === 0) return toast.info("No claims to export.")
      if (kind === "list") {
        downloadClaimBlob(
          `${filename}.xlsx`,
          await buildClaimsListWorkbook({ groups, periodMonth: month }),
        )
      } else if (kind === "totals") {
        downloadClaimBlob(
          `${filename}-totals.xlsx`,
          await buildMonthlyTotalsWorkbook({
            groups,
            periodMonth: month,
            valueDate: new Date().toISOString().slice(0, 10),
          }),
        )
      } else {
        if (single && groups.length === 1) {
          const buffer = await buildClaimFormWorkbook(groups[0])
          downloadClaimBlob(
            `${filename}-form.xlsx`,
            new Blob([buffer], {
              type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            }),
          )
        } else {
          downloadClaimBlob(
            `${filename}-forms.zip`,
            await buildClaimFormsZip(groups, month),
          )
        }
      }
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't export claims"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={busy}>
          <IconDownload className="size-4" />
          {busy ? "Exporting…" : label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => run("list")}>
          Claims list (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("totals")}>
          Monthly totals (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => run("forms")}>
          {single ? "Claim form (.xlsx)" : "Claim forms (.zip)"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// A short "June 2026" / "June 2026 · Resubmission 1" batch label.
function batchLabel(g: Group): string {
  const base = monthLabel(g.periodMonth)
  return g.title ? `${base} · ${g.title}` : base
}

// `showOrgFilters` adds department/team filters for the HR-wide view.
// `source` selects the data set: "mine" = batches awaiting the caller (Team →
// Claim Approvals); "all" = every batch org-wide (HR Lounge oversight, requires
// `claims:read:all`).
export function ClaimsApprovalQueue({
  showOrgFilters,
  source = "mine",
}: {
  showOrgFilters?: boolean
  source?: "mine" | "all"
}) {
  const [month, setMonth] = React.useState(currentMonth())
  const [departmentId, setDepartmentId] = React.useState(ALL)
  const [teamId, setTeamId] = React.useState(ALL)
  const [search, setSearch] = React.useState("")
  const [selected, setSelected] = React.useState<Group | null>(null)
  const [showCompleted, setShowCompleted] = React.useState(false)

  const departments =
    useQuery(api.departments.list, showOrgFilters ? {} : "skip") ?? []
  const teams = useQuery(api.teams.list, showOrgFilters ? {} : "skip") ?? []

  const filterArgs = {
    month,
    departmentId:
      departmentId !== ALL ? (departmentId as Id<"departments">) : undefined,
    teamId: teamId !== ALL ? (teamId as Id<"teams">) : undefined,
  }
  const mineGroups = useQuery(
    api.claims.approvalClaimGroups,
    source === "mine" ? filterArgs : "skip",
  )
  const allGroups = useQuery(
    api.claims.allClaimGroups,
    source === "all" ? filterArgs : "skip",
  )
  const groups = source === "all" ? allGroups : mineGroups

  const matches = (g: Group) =>
    search.trim()
      ? g.employeeName.toLowerCase().includes(search.trim().toLowerCase())
      : true
  const active = (groups ?? []).filter((g) => !g.complete && matches(g))
  const completed = (groups ?? []).filter((g) => g.complete && matches(g))

  // Drill-down: inline table for one claim group (not a modal).
  if (selected) {
    return (
      <GroupClaims
        group={selected}
        source={source}
        onBack={() => setSelected(null)}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 px-4 lg:flex-row lg:items-center lg:justify-between lg:px-6">
        <MonthNav month={month} onChange={setMonth} />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {showOrgFilters && (
            <>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger className="w-full sm:w-44">
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
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="All teams" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All teams</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t._id} value={t._id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          <div className="relative sm:w-56">
            <IconSearch className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              placeholder="Search employee"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <ExportMenu
            label={source === "all" ? "Export all" : "Export"}
            filename={`claims-${month}`}
            month={month}
            args={{ source, ...filterArgs }}
          />
        </div>
      </div>

      {/* Active claim groups awaiting the caller */}
      <div className="mx-4 rounded-lg border lg:mx-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Batch</TableHead>
              <TableHead>{source === "all" ? "Pending" : "Claims to approve"}</TableHead>
              <TableHead>Total amount</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups === undefined ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : active.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-muted-foreground py-8 text-center"
                >
                  {source === "all"
                    ? `No claim batches with pending claims for ${monthLabel(month)}.`
                    : `Nothing awaiting your approval for ${monthLabel(month)}.`}
                </TableCell>
              </TableRow>
            ) : (
              active.map((g) => (
                <TableRow
                  key={g.groupId}
                  className="hover:bg-muted/50 cursor-pointer"
                  onClick={() => setSelected(g)}
                >
                  <TableCell className="font-medium">{g.employeeName}</TableCell>
                  <TableCell className="text-sm">{batchLabel(g)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{g.pendingCount}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums font-medium">
                    {formatMoney(g.totalAmountCents, g.currency)}
                  </TableCell>
                  <TableCell>
                    <IconChevronRight className="text-muted-foreground size-4" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Completed batches — collapsed behind a chevron */}
      {completed.length > 0 && (
        <div className="mx-4 lg:mx-6">
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm font-medium"
            onClick={() => setShowCompleted((v) => !v)}
          >
            {showCompleted ? (
              <IconChevronDown className="size-4" />
            ) : (
              <IconChevronRight className="size-4" />
            )}
            Completed batches ({completed.length})
          </button>
          {showCompleted && (
            <div className="mt-2 rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Total amount</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completed.map((g) => (
                    <TableRow
                      key={g.groupId}
                      className="hover:bg-muted/50 cursor-pointer"
                      onClick={() => setSelected(g)}
                    >
                      <TableCell className="font-medium">
                        {g.employeeName}
                      </TableCell>
                      <TableCell className="text-sm">{batchLabel(g)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {g.approvedCount > 0 && (
                            <Badge variant="default">
                              {g.approvedCount} approved
                            </Badge>
                          )}
                          {g.rejectedCount > 0 && (
                            <Badge variant="destructive">
                              {g.rejectedCount} rejected
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="tabular-nums font-medium">
                        {formatMoney(g.totalAmountCents, g.currency)}
                      </TableCell>
                      <TableCell>
                        <IconChevronRight className="text-muted-foreground size-4" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

type GroupClaim = FunctionReturnType<
  typeof api.claims.approvalClaimsForGroup
>[number]

// Inline table of one claim group's claims: pending ones the caller can act on
// (view / edit / reject / remark) plus already-decided ones shown read-only
// (approved, or rejected and visible under the top-down rule). Footer carries
// "approve all" and, for finance, "mark all reimbursed".
function GroupClaims({
  group,
  source,
  onBack,
}: {
  group: Group
  source: "mine" | "all"
  onBack: () => void
}) {
  const mineClaims = useQuery(
    api.claims.approvalClaimsForGroup,
    source === "mine" ? { groupId: group.groupId } : "skip",
  )
  const allClaims = useQuery(
    api.claims.allClaimsForGroup,
    source === "all" ? { groupId: group.groupId } : "skip",
  )
  const claims = source === "all" ? allClaims : mineClaims
  const member = useCurrentMember()
  const reject = useMutation(api.claims.reject)
  const approveAll = useMutation(api.claims.approveAllForGroup)
  const markReimbursed = useMutation(api.claims.markGroupReimbursed)
  const getUploadUrl = useMutation(api.claims.generateUploadUrl)

  const [openId, setOpenId] = React.useState<Id<"claims"> | null>(null)
  const [editId, setEditId] = React.useState<Id<"claims"> | null>(null)
  const [rejectId, setRejectId] = React.useState<Id<"claims"> | null>(null)
  const [rejectNote, setRejectNote] = React.useState("")
  const [remarkClaim, setRemarkClaim] = React.useState<{
    id: Id<"claims">
    remarks: string
  } | null>(null)
  const [approveAllOpen, setApproveAllOpen] = React.useState(false)
  const [signAllOpen, setSignAllOpen] = React.useState(false)
  const [reimburseOpen, setReimburseOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const currency = claims?.[0]?.currency ?? group.currency
  const actionable = (claims ?? []).filter((c) => c.canAct)
  // Any claim awaiting the caller that needs their signature to approve.
  const needsSignature = actionable.some((c) => c.needsSignature)
  const pendingTotal = actionable.reduce((s, c) => s + c.amountCents, 0)
  const approvedCount = (claims ?? []).filter(
    (c) => c.status === "approved",
  ).length
  const canReimburse =
    !!member &&
    member.permissions.includes("claims:approve:finance") &&
    approvedCount > 0

  async function handleReject() {
    if (!rejectId) return
    setBusy(true)
    try {
      await reject({ claimId: rejectId, note: rejectNote.trim() || undefined })
      toast.success("Claim rejected")
      setRejectId(null)
      setRejectNote("")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't reject this claim"))
    } finally {
      setBusy(false)
    }
  }

  async function handleApproveAll(signatureStorageId?: Id<"_storage">) {
    setBusy(true)
    try {
      const { approved } = await approveAll({
        groupId: group.groupId,
        signatureStorageId,
      })
      toast.success(
        `Approved ${approved} claim${approved === 1 ? "" : "s"} for ${group.employeeName}`,
      )
      setApproveAllOpen(false)
      setSignAllOpen(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't approve claims"))
    } finally {
      setBusy(false)
    }
  }

  async function handleReimburse() {
    setBusy(true)
    try {
      const { reimbursed } = await markReimbursed({ groupId: group.groupId })
      toast.success(
        `Marked ${reimbursed} claim${reimbursed === 1 ? "" : "s"} reimbursed`,
      )
      setReimburseOpen(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't mark claims reimbursed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 px-4 lg:px-6">
        <Button variant="outline" size="icon" className="size-8" onClick={onBack}>
          <IconArrowLeft className="size-4" />
        </Button>
        <div className="flex-1">
          <h3 className="font-semibold">{group.employeeName}</h3>
          <p className="text-muted-foreground text-sm">{batchLabel(group)}</p>
        </div>
        <ExportMenu
          label="Export claims"
          single
          filename={`claims-${group.employeeName.replace(/\s+/g, "-")}-${group.periodMonth}`}
          month={group.periodMonth}
          args={{
            source,
            month: group.periodMonth,
            employeeId: group.employeeId,
          }}
        />
      </div>

      <div className="mx-4 rounded-lg border lg:mx-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Receipt</TableHead>
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
            ) : claims.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-muted-foreground py-8 text-center"
                >
                  Nothing to show in this batch.
                </TableCell>
              </TableRow>
            ) : (
              claims.map((c) => (
                <TableRow
                  key={c._id}
                  className="hover:bg-muted/50 cursor-pointer"
                  onClick={() => setOpenId(c._id)}
                >
                  <TableCell>
                    <span className="font-medium">{c.claimTypeName}</span>
                    <div className="text-muted-foreground max-w-[200px] truncate text-xs">
                      {c.description || "—"}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{c.incurredDate}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatMoney(c.amountCents, c.currency)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={CLAIM_STATUS_BADGE[c.status]}>
                      {CLAIM_STATUS_LABELS[c.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {c.receipts.length > 0 ? (
                      <button
                        type="button"
                        className="text-primary flex items-center gap-1 text-sm hover:underline"
                        title={`Open receipt${c.receipts.length > 1 ? ` (1 of ${c.receipts.length})` : ""} in new tab`}
                        onClick={(e) => {
                          e.stopPropagation()
                          window.open(
                            c.receipts[0].url,
                            "_blank",
                            "noopener,noreferrer",
                          )
                        }}
                      >
                        <IconExternalLink className="size-4" />
                        Receipt
                      </button>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {c.canAct ? (
                      <div
                        className="flex justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditId(c._id)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-8"
                          title="Remark"
                          onClick={() =>
                            setRemarkClaim({
                              id: c._id,
                              remarks: c.remarks ?? "",
                            })
                          }
                        >
                          <IconMessage className="size-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive"
                          onClick={() => setRejectId(c._id)}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : c.waitingForBatch ? (
                      <span
                        className="text-muted-foreground text-xs"
                        title="Cleared its steps early — waiting for the rest of the batch to reach this approver."
                      >
                        Waiting for batch
                      </span>
                    ) : (c.status === "pending_manager" ||
                        c.status === "pending_finance") &&
                      c.currentApprover ? (
                      <span className="text-muted-foreground text-xs">
                        Awaiting {c.currentApprover}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        {c.status === "rejected" && c.decisionNote
                          ? c.decisionNote
                          : "—"}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <span className="text-muted-foreground">Awaiting you: </span>
            <span className="font-semibold tabular-nums">
              {formatMoney(pendingTotal, currency)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {canReimburse && (
              <Button
                variant="outline"
                onClick={() => setReimburseOpen(true)}
              >
                Mark all reimbursed ({approvedCount})
              </Button>
            )}
            <Button
              disabled={actionable.length === 0}
              onClick={() =>
                needsSignature
                  ? setSignAllOpen(true)
                  : setApproveAllOpen(true)
              }
            >
              {needsSignature ? "Approve & sign all" : "Approve all"} (
              {actionable.length})
            </Button>
          </div>
        </div>
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
      {remarkClaim && (
        <RemarkDialog
          key={remarkClaim.id}
          claimId={remarkClaim.id}
          initial={remarkClaim.remarks}
          open
          onOpenChange={(o) => !o && setRemarkClaim(null)}
        />
      )}
      <Dialog
        open={rejectId !== null}
        onOpenChange={(o) => {
          if (!o && !busy) {
            setRejectId(null)
            setRejectNote("")
          }
        }}
      >
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
              onClick={() => {
                setRejectId(null)
                setRejectNote("")
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" disabled={busy} onClick={handleReject}>
              {busy ? "Rejecting…" : "Reject claim"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={approveAllOpen}
        onOpenChange={setApproveAllOpen}
        title="Approve all claims?"
        description={`This approves all ${actionable.length} claim${actionable.length === 1 ? "" : "s"} from ${group.employeeName} awaiting your decision (${formatMoney(pendingTotal, currency)}).`}
        confirmLabel="Approve all"
        busy={busy}
        onConfirm={() => handleApproveAll()}
      />
      <SignatureCaptureDialog
        open={signAllOpen}
        onOpenChange={setSignAllOpen}
        title="Sign to approve claims"
        description={`Your signature is applied to all ${actionable.length} claim${actionable.length === 1 ? "" : "s"} from ${group.employeeName} awaiting your decision.`}
        confirmLabel="Approve & sign"
        getUploadUrl={() => getUploadUrl({})}
        onSigned={async (storageId) => {
          await handleApproveAll(storageId as Id<"_storage">)
        }}
      />
      <ConfirmDialog
        open={reimburseOpen}
        onOpenChange={setReimburseOpen}
        title="Mark all reimbursed?"
        description={`This marks all ${approvedCount} approved claim${approvedCount === 1 ? "" : "s"} in this batch as reimbursed.`}
        confirmLabel="Mark reimbursed"
        busy={busy}
        onConfirm={handleReimburse}
      />
    </div>
  )
}

function RemarkDialog({
  claimId,
  initial,
  open,
  onOpenChange,
}: {
  claimId: Id<"claims">
  initial: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const setRemarks = useMutation(api.claims.setRemarks)
  const [value, setValue] = React.useState(initial)
  const [busy, setBusy] = React.useState(false)

  async function save() {
    setBusy(true)
    try {
      await setRemarks({ claimId, remarks: value })
      toast.success("Remark saved")
      onOpenChange(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save remark"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remark</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          <Label>Remark for this claim</Label>
          <Textarea
            rows={3}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Add a note about this claim"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save remark"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
