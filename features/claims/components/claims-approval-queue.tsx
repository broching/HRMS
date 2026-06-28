"use client"

import Link from "next/link"
import { useQuery, useMutation } from "convex/react"
import { IconCheck, IconX } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  CLAIM_STATUS_LABELS,
  formatMoney,
} from "@/features/claims/lib/labels"

export function ClaimsApprovalQueue() {
  const queue = useQuery(api.claims.approvalQueue)
  const managerApprove = useMutation(api.claims.managerApprove)
  const financeApprove = useMutation(api.claims.financeApprove)
  const reject = useMutation(api.claims.reject)

  async function run(p: Promise<unknown>, ok: string) {
    try {
      await p
      toast.success(ok)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed")
    }
  }

  return (
    <div className="mx-4 rounded-lg border lg:mx-6">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead className="text-right">Decision</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {queue === undefined ? (
            <TableRow>
              <TableCell colSpan={5}>
                <Skeleton className="h-6 w-full" />
              </TableCell>
            </TableRow>
          ) : queue.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={5}
                className="text-muted-foreground py-8 text-center"
              >
                Nothing awaiting your approval.
              </TableCell>
            </TableRow>
          ) : (
            queue.map((c) => (
              <TableRow key={c._id}>
                <TableCell className="font-medium">{c.employeeName}</TableCell>
                <TableCell>
                  <Link href={`/claims/${c._id}`} className="hover:underline">
                    {c.claimTypeName}
                  </Link>
                  <div className="text-muted-foreground max-w-[220px] truncate text-xs">
                    {c.description}
                  </div>
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatMoney(c.amountCents, c.currency)}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {CLAIM_STATUS_LABELS[c.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        run(
                          c.status === "pending_manager"
                            ? managerApprove({ claimId: c._id })
                            : financeApprove({ claimId: c._id }),
                          "Approved",
                        )
                      }
                    >
                      <IconCheck className="size-4 text-green-600" />
                      Approve
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => run(reject({ claimId: c._id }), "Rejected")}
                    >
                      <IconX className="size-4 text-red-600" />
                      Reject
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
