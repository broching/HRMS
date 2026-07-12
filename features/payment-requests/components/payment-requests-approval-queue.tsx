"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import { IconChevronRight, IconChevronDown } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { PaymentRequestStatus } from "@/convex/lib/enums"
import { getErrorMessage } from "@/lib/errors"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ConfirmDialog } from "@/features/claims/components/confirm-dialog"
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
import {
  PR_STATUS_LABELS,
  PR_STATUS_BADGE,
  PR_SORT_OPTIONS,
  sortPaymentRequests,
  type PrSortKey,
  requestRef,
  formatMoney,
  currentMonth,
} from "@/features/payment-requests/lib/labels"
import { countryName } from "@/lib/countries"
import { MonthNav } from "@/features/claims/components/month-nav"
import { PaymentRequestDetailDialog } from "@/features/payment-requests/components/payment-request-detail"
import { PaymentRequestExportMenu } from "@/features/payment-requests/components/payment-request-export-menu"

// Statuses that are "done" — surfaced under the collapsible Completed section.
// Approved (awaiting payment) stays in the active list so the Mark paid action
// is front-and-center for finance.
const COMPLETED: PaymentRequestStatus[] = ["rejected", "paid"]

type Row = {
  _id: Id<"paymentRequests">
  requestNumber: number
  employeeName: string
  purpose: string
  payeeName: string
  country: string | null
  amountCents: number
  currency: string
  status: PaymentRequestStatus
  currentApprover: string | null
  canMarkPaid: boolean
  _creationTime: number
  requestDate: string
  invoiceDate: string | null
}

const ALL = "__all__"
const STATUS_OPTIONS = Object.keys(PR_STATUS_LABELS) as PaymentRequestStatus[]

export function PaymentRequestsApprovalQueue({
  source,
}: {
  source: "approver" | "all"
}) {
  const [month, setMonth] = React.useState(currentMonth())
  const [openId, setOpenId] = React.useState<Id<"paymentRequests"> | null>(null)
  const [payTarget, setPayTarget] = React.useState<Row | null>(null)
  const [paying, setPaying] = React.useState(false)
  const markPaid = useMutation(api.paymentRequests.markPaid)
  const [showCompleted, setShowCompleted] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [country, setCountry] = React.useState<string>(ALL)
  const [status, setStatus] = React.useState<string>(ALL)
  const [minAmount, setMinAmount] = React.useState("")
  const [maxAmount, setMaxAmount] = React.useState("")
  const [sort, setSort] = React.useState<PrSortKey>("submitted_desc")

  const approverRows = useQuery(
    api.paymentRequests.approvalQueue,
    source === "approver" ? { month } : "skip",
  )
  const allRows = useQuery(
    api.paymentRequests.allRequests,
    source === "all" ? { month } : "skip",
  )
  const rows = (source === "approver" ? approverRows : allRows) as
    | Row[]
    | undefined

  // Distinct countries present in the current month's rows, for the filter.
  const countryOptions = React.useMemo(() => {
    const codes = new Set<string>()
    for (const r of rows ?? []) if (r.country) codes.add(r.country)
    return [...codes].sort((a, b) => countryName(a).localeCompare(countryName(b)))
  }, [rows])

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    const min = minAmount ? Math.round(Number(minAmount) * 100) : null
    const max = maxAmount ? Math.round(Number(maxAmount) * 100) : null
    return (rows ?? []).filter((r) => {
      if (country !== ALL && r.country !== country) return false
      if (status !== ALL && r.status !== status) return false
      if (min != null && r.amountCents < min) return false
      if (max != null && r.amountCents > max) return false
      if (q) {
        const hay = `${requestRef(r.requestNumber)} ${r.employeeName} ${r.payeeName} ${r.purpose}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [rows, search, country, status, minAmount, maxAmount])

  const sorted = React.useMemo(
    () => sortPaymentRequests(filtered, sort),
    [filtered, sort],
  )

  const active = sorted.filter((r) => !COMPLETED.includes(r.status))
  const completed = sorted.filter((r) => COMPLETED.includes(r.status))

  async function handleMarkPaid() {
    if (!payTarget) return
    setPaying(true)
    try {
      await markPaid({ requestId: payTarget._id })
      toast.success("Marked paid")
      setPayTarget(null)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't mark this request paid"))
    } finally {
      setPaying(false)
    }
  }
  const hasFilters =
    search.trim() !== "" ||
    country !== ALL ||
    status !== ALL ||
    minAmount !== "" ||
    maxAmount !== ""

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthNav month={month} onChange={setMonth} />
        <PaymentRequestExportMenu month={month} />
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search ref, requestor, payee, purpose…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full sm:w-64"
        />
        <Select value={country} onValueChange={setCountry}>
          <SelectTrigger className="h-9 w-[9.5rem]">
            <SelectValue placeholder="Country" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All countries</SelectItem>
            {countryOptions.map((code) => (
              <SelectItem key={code} value={code}>
                {countryName(code)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-[9rem]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {PR_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="Min $"
            value={minAmount}
            onChange={(e) => setMinAmount(e.target.value)}
            className="h-9 w-24"
          />
          <span className="text-muted-foreground text-xs">–</span>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="Max $"
            value={maxAmount}
            onChange={(e) => setMaxAmount(e.target.value)}
            className="h-9 w-24"
          />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as PrSortKey)}>
          <SelectTrigger className="h-9 w-[11rem]">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            {PR_SORT_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hasFilters && (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground text-xs underline"
            onClick={() => {
              setSearch("")
              setCountry(ALL)
              setStatus(ALL)
              setMinAmount("")
              setMaxAmount("")
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Active requests */}
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Ref</TableHead>
              <TableHead>Requestor</TableHead>
              <TableHead className="hidden md:table-cell">Purpose</TableHead>
              <TableHead className="hidden sm:table-cell">Payee</TableHead>
              <TableHead className="hidden lg:table-cell">Country</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="hidden lg:table-cell">With</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows === undefined ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground py-8 text-center text-sm">
                  Loading…
                </TableCell>
              </TableRow>
            ) : active.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-muted-foreground py-8 text-center text-sm">
                  {source === "approver"
                    ? "Nothing awaiting your decision this month."
                    : "No open payment requests this month."}
                </TableCell>
              </TableRow>
            ) : (
              active.map((r) => (
                <RequestRow
                  key={r._id}
                  r={r}
                  onOpen={() => setOpenId(r._id)}
                  onMarkPaid={() => setPayTarget(r)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Completed — collapsed behind a chevron */}
      {completed.length > 0 && (
        <div>
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
            Completed ({completed.length})
          </button>
          {showCompleted && (
            <div className="mt-2 rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Ref</TableHead>
                    <TableHead>Requestor</TableHead>
                    <TableHead className="hidden md:table-cell">Purpose</TableHead>
                    <TableHead className="hidden sm:table-cell">Payee</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="hidden lg:table-cell">With</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completed.map((r) => (
                    <RequestRow
                      key={r._id}
                      r={r}
                      onOpen={() => setOpenId(r._id)}
                      onMarkPaid={() => setPayTarget(r)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      <PaymentRequestDetailDialog
        requestId={openId}
        open={openId != null}
        onOpenChange={(o) => !o && setOpenId(null)}
      />

      <ConfirmDialog
        open={payTarget != null}
        onOpenChange={(o) => !o && !paying && setPayTarget(null)}
        title="Mark request paid?"
        description={
          payTarget
            ? `Confirm you've paid ${payTarget.payeeName} ${formatMoney(payTarget.amountCents, payTarget.currency)} for ${requestRef(payTarget.requestNumber)}. This closes the request.`
            : ""
        }
        confirmLabel="Mark paid"
        busy={paying}
        onConfirm={handleMarkPaid}
      />
    </div>
  )
}

function RequestRow({
  r,
  onOpen,
  onMarkPaid,
}: {
  r: Row
  onOpen: () => void
  onMarkPaid?: () => void
}) {
  return (
    <TableRow className="cursor-pointer" onClick={onOpen}>
      <TableCell className="font-mono text-xs">{requestRef(r.requestNumber)}</TableCell>
      <TableCell className="max-w-[10rem] truncate">{r.employeeName}</TableCell>
      <TableCell className="hidden max-w-[14rem] truncate md:table-cell">{r.purpose}</TableCell>
      <TableCell className="hidden max-w-[12rem] truncate sm:table-cell">{r.payeeName}</TableCell>
      <TableCell className="text-muted-foreground hidden text-xs lg:table-cell">
        {r.country ? countryName(r.country) : "—"}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {formatMoney(r.amountCents, r.currency)}
      </TableCell>
      <TableCell className="text-muted-foreground hidden text-xs lg:table-cell">
        {r.currentApprover ?? "—"}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-between gap-2">
          <Badge variant={PR_STATUS_BADGE[r.status]}>{PR_STATUS_LABELS[r.status]}</Badge>
          {r.canMarkPaid && onMarkPaid && (
            <Button
              size="sm"
              className="h-7 bg-green-600 px-2.5 text-white hover:bg-green-700"
              onClick={(e) => {
                e.stopPropagation()
                onMarkPaid()
              }}
            >
              Mark paid
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}
