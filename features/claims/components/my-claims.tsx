"use client"

import Link from "next/link"
import { useQuery, useMutation } from "convex/react"
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
  CLAIM_STATUS_BADGE,
  CLAIM_STATUS_LABELS,
  formatMoney,
} from "@/features/claims/lib/labels"

export function MyClaims() {
  const claims = useQuery(api.claims.mine)
  const cancel = useMutation(api.claims.cancel)

  async function handleCancel(claimId: Id<"claims">) {
    try {
      await cancel({ claimId })
      toast.success("Claim cancelled")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel")
    }
  }

  return (
    <div className="mx-4 rounded-lg border lg:mx-6">
      <Table>
        <TableHeader>
          <TableRow>
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
              <TableCell colSpan={5}>
                <Skeleton className="h-6 w-full" />
              </TableCell>
            </TableRow>
          ) : claims.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={5}
                className="text-muted-foreground py-8 text-center"
              >
                No claims yet.
              </TableCell>
            </TableRow>
          ) : (
            claims.map((c) => (
              <TableRow key={c._id}>
                <TableCell>
                  <Link
                    href={`/claims/${c._id}`}
                    className="font-medium hover:underline"
                  >
                    {c.claimTypeName}
                  </Link>
                  <div className="text-muted-foreground max-w-[280px] truncate text-xs">
                    {c.description}
                  </div>
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatMoney(c.amountCents, c.currency)}
                </TableCell>
                <TableCell className="text-sm">{c.incurredDate}</TableCell>
                <TableCell>
                  <Badge variant={CLAIM_STATUS_BADGE[c.status]}>
                    {CLAIM_STATUS_LABELS[c.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/claims/${c._id}`}>View</Link>
                  </Button>
                  {(c.status === "pending_manager" ||
                    c.status === "pending_finance") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancel(c._id)}
                    >
                      Cancel
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
