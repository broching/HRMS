"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ApprovalsTable } from "@/features/payroll/components/approvals-table"

export function PayrollApprovalsInbox() {
  const runs = useQuery(api.payrollApproval.myApprovalRuns)

  if (runs === undefined) {
    return (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (runs.length === 0) {
    return (
      <div className="text-muted-foreground rounded-lg border py-12 text-center text-sm mx-4 lg:mx-6">
        No payslips are awaiting your approval.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      {runs.map((r) => (
        <Card key={r.runId}>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">
              {r.label}{" "}
              <span className="text-muted-foreground text-xs font-normal">
                · {r.periodMonth}
              </span>
            </CardTitle>
            <Badge variant="outline">
              {r.pendingCount} awaiting you
            </Badge>
          </CardHeader>
          <CardContent>
            <ApprovalsTable runId={r.runId} />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
