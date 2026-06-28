"use client"

import Link from "next/link"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
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
  PAYROLL_STATUS_BADGE,
  PAYROLL_STATUS_LABELS,
  formatMoney,
} from "@/features/payroll/lib/labels"

export function MyPayslips() {
  const slips = useQuery(api.payroll.myPayslips)

  return (
    <div className="mx-4 rounded-lg border lg:mx-6">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Period</TableHead>
            <TableHead>Gross</TableHead>
            <TableHead>CPF</TableHead>
            <TableHead>Net pay</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {slips === undefined ? (
            <TableRow>
              <TableCell colSpan={6}>
                <Skeleton className="h-6 w-full" />
              </TableCell>
            </TableRow>
          ) : slips.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="text-muted-foreground py-8 text-center"
              >
                No payslips available yet.
              </TableCell>
            </TableRow>
          ) : (
            slips.map((p) => (
              <TableRow key={p._id}>
                <TableCell className="font-medium">{p.periodMonth}</TableCell>
                <TableCell className="tabular-nums">
                  {formatMoney(p.grossCents, p.currency)}
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatMoney(p.employeeCpfCents, p.currency)}
                </TableCell>
                <TableCell className="tabular-nums font-medium">
                  {formatMoney(p.netCents, p.currency)}
                </TableCell>
                <TableCell>
                  <Badge variant={PAYROLL_STATUS_BADGE[p.status]}>
                    {PAYROLL_STATUS_LABELS[p.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/payslips/${p._id}`}>View</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
