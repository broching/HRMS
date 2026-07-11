"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
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
import { SubmitPaymentRequestDialog } from "@/features/payment-requests/components/submit-payment-request-dialog"
import { PaymentRequestDetailDialog } from "@/features/payment-requests/components/payment-request-detail"

export function MyPaymentRequests() {
  const [month, setMonth] = React.useState(currentMonth())
  const [openId, setOpenId] = React.useState<Id<"paymentRequests"> | null>(null)
  const requests = useQuery(api.paymentRequests.mine, { month })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthNav month={month} onChange={setMonth} />
        <SubmitPaymentRequestDialog month={month} />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Ref</TableHead>
              <TableHead>Purpose</TableHead>
              <TableHead className="hidden sm:table-cell">Payee</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="hidden sm:table-cell">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests === undefined ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-8 text-center text-sm">
                  Loading…
                </TableCell>
              </TableRow>
            ) : requests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-8 text-center text-sm">
                  No payment requests this month.
                </TableCell>
              </TableRow>
            ) : (
              requests.map((r) => (
                <TableRow
                  key={r._id}
                  className="cursor-pointer"
                  onClick={() => setOpenId(r._id)}
                >
                  <TableCell className="font-mono text-xs">
                    {requestRef(r.requestNumber)}
                  </TableCell>
                  <TableCell className="max-w-[16rem] truncate">
                    {r.purpose}
                    <span className="text-muted-foreground block text-xs sm:hidden">
                      {r.payeeName} · {PR_STATUS_LABELS[r.status]}
                    </span>
                  </TableCell>
                  <TableCell className="hidden max-w-[12rem] truncate sm:table-cell">
                    {r.payeeName}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(r.amountCents, r.currency)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant={PR_STATUS_BADGE[r.status]}>
                      {PR_STATUS_LABELS[r.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PaymentRequestDetailDialog
        requestId={openId}
        open={openId != null}
        onOpenChange={(o) => !o && setOpenId(null)}
      />
    </div>
  )
}
