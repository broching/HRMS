"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { IconChevronRight, IconChevronDown } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { PaymentRequestStatus } from "@/convex/lib/enums"
import { Badge } from "@/components/ui/badge"
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
  requestRef,
  formatMoney,
  currentMonth,
} from "@/features/payment-requests/lib/labels"
import { MonthNav } from "@/features/claims/components/month-nav"
import { PaymentRequestDetailDialog } from "@/features/payment-requests/components/payment-request-detail"
import { PaymentRequestExportMenu } from "@/features/payment-requests/components/payment-request-export-menu"

// Statuses that are "done" — surfaced under the collapsible Completed section.
const COMPLETED: PaymentRequestStatus[] = ["approved", "rejected", "paid"]

type Row = {
  _id: Id<"paymentRequests">
  requestNumber: number
  employeeName: string
  purpose: string
  payeeName: string
  amountCents: number
  currency: string
  status: PaymentRequestStatus
  currentApprover: string | null
}

export function PaymentRequestsApprovalQueue({
  source,
}: {
  source: "approver" | "all"
}) {
  const [month, setMonth] = React.useState(currentMonth())
  const [openId, setOpenId] = React.useState<Id<"paymentRequests"> | null>(null)
  const [showCompleted, setShowCompleted] = React.useState(false)

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

  const active = (rows ?? []).filter((r) => !COMPLETED.includes(r.status))
  const completed = (rows ?? []).filter((r) => COMPLETED.includes(r.status))

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthNav month={month} onChange={setMonth} />
        <PaymentRequestExportMenu month={month} />
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
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="hidden lg:table-cell">With</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows === undefined ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-8 text-center text-sm">
                  Loading…
                </TableCell>
              </TableRow>
            ) : active.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-8 text-center text-sm">
                  {source === "approver"
                    ? "Nothing awaiting your decision this month."
                    : "No open payment requests this month."}
                </TableCell>
              </TableRow>
            ) : (
              active.map((r) => (
                <RequestRow key={r._id} r={r} onOpen={() => setOpenId(r._id)} />
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
                    <RequestRow key={r._id} r={r} onOpen={() => setOpenId(r._id)} />
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
    </div>
  )
}

function RequestRow({ r, onOpen }: { r: Row; onOpen: () => void }) {
  return (
    <TableRow className="cursor-pointer" onClick={onOpen}>
      <TableCell className="font-mono text-xs">{requestRef(r.requestNumber)}</TableCell>
      <TableCell className="max-w-[10rem] truncate">{r.employeeName}</TableCell>
      <TableCell className="hidden max-w-[14rem] truncate md:table-cell">{r.purpose}</TableCell>
      <TableCell className="hidden max-w-[12rem] truncate sm:table-cell">{r.payeeName}</TableCell>
      <TableCell className="text-right tabular-nums">
        {formatMoney(r.amountCents, r.currency)}
      </TableCell>
      <TableCell className="text-muted-foreground hidden text-xs lg:table-cell">
        {r.currentApprover ?? "—"}
      </TableCell>
      <TableCell>
        <Badge variant={PR_STATUS_BADGE[r.status]}>{PR_STATUS_LABELS[r.status]}</Badge>
      </TableCell>
    </TableRow>
  )
}
