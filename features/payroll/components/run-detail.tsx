"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/shared/page-header"
import {
  PAYROLL_STATUS_BADGE,
  PAYROLL_STATUS_LABELS,
  formatMoney,
} from "@/features/payroll/lib/labels"

function Stat({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-4">
        <span className="text-muted-foreground text-xs">{label}</span>
        <span className="text-xl font-semibold tabular-nums">{value}</span>
      </CardContent>
    </Card>
  )
}

export function RunDetail({ runId }: { runId: Id<"payrollRuns"> }) {
  const router = useRouter()
  const data = useQuery(api.payroll.getRun, { runId })
  const finalize = useMutation(api.payroll.finalizeRun)
  const markPaid = useMutation(api.payroll.markPaid)
  const deleteRun = useMutation(api.payroll.deleteRun)

  async function run(p: Promise<unknown>, ok: string, back?: boolean) {
    try {
      await p
      toast.success(ok)
      if (back) router.push("/payroll")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed")
    }
  }

  if (data === undefined) {
    return (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (data === null) {
    return (
      <div className="px-4 lg:px-6">
        <p className="text-muted-foreground text-sm">Run not found.</p>
      </div>
    )
  }

  const { run: r, payslips } = data

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={r.label} description={`Period ${r.periodMonth}`}>
        <Badge variant={PAYROLL_STATUS_BADGE[r.status]}>
          {PAYROLL_STATUS_LABELS[r.status]}
        </Badge>
      </PageHeader>

      <div className="grid gap-4 px-4 sm:grid-cols-2 lg:grid-cols-4 lg:px-6">
        <Stat label="Gross" value={formatMoney(r.grossCents, r.currency)} />
        <Stat
          label="Employee CPF"
          value={formatMoney(r.employeeCpfCents, r.currency)}
        />
        <Stat
          label="Employer CPF"
          value={formatMoney(r.employerCpfCents, r.currency)}
        />
        <Stat label="Net pay" value={formatMoney(r.netCents, r.currency)} />
      </div>

      <div className="flex flex-wrap gap-2 px-4 lg:px-6">
        {r.status === "draft" && (
          <>
            <Button onClick={() => run(finalize({ runId }), "Run finalized")}>
              Finalize
            </Button>
            <Button
              variant="outline"
              onClick={() => run(deleteRun({ runId }), "Run deleted", true)}
            >
              Delete
            </Button>
          </>
        )}
        {r.status === "finalized" && (
          <Button onClick={() => run(markPaid({ runId }), "Marked as paid")}>
            Mark as paid
          </Button>
        )}
        {r.payDate && (
          <span className="text-muted-foreground self-center text-sm">
            Pay date: {r.payDate}
          </span>
        )}
      </div>

      <div className="mx-4 rounded-lg border lg:mx-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Gross</TableHead>
              <TableHead>Emp. CPF</TableHead>
              <TableHead>Employer CPF</TableHead>
              <TableHead>Net</TableHead>
              <TableHead className="text-right">Payslip</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payslips.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-muted-foreground py-8 text-center"
                >
                  No payslips. Add compensation for employees and recreate the
                  run.
                </TableCell>
              </TableRow>
            ) : (
              payslips.map((p) => (
                <TableRow key={p._id}>
                  <TableCell className="font-medium">{p.employeeName}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatMoney(p.grossCents, p.currency)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatMoney(p.employeeCpfCents, p.currency)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatMoney(p.employerCpfCents, p.currency)}
                  </TableCell>
                  <TableCell className="tabular-nums font-medium">
                    {formatMoney(p.netCents, p.currency)}
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
    </div>
  )
}
