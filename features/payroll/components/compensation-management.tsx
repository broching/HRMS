"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { CpfStatus } from "@/convex/lib/enums"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { SetCompensationDialog } from "./set-compensation-dialog"
import {
  CPF_STATUS_LABELS,
  formatMoney,
} from "@/features/payroll/lib/labels"

type Target = {
  employeeId: Id<"employees">
  name: string
  cpfStatus: CpfStatus | null
}

export function CompensationManagement() {
  const rows = useQuery(api.compensation.overview)
  const [target, setTarget] = React.useState<Target | null>(null)

  return (
    <div className="mx-4 rounded-lg border lg:mx-6">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Base monthly</TableHead>
            <TableHead>CPF status</TableHead>
            <TableHead>Effective</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows === undefined ? (
            <TableRow>
              <TableCell colSpan={5}>
                <Skeleton className="h-6 w-full" />
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={5}
                className="text-muted-foreground py-8 text-center"
              >
                No employees yet.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.employeeId}>
                <TableCell>
                  <div className="font-medium">{r.name}</div>
                  {r.positionTitle && (
                    <div className="text-muted-foreground text-xs">
                      {r.positionTitle}
                    </div>
                  )}
                </TableCell>
                <TableCell className="tabular-nums">
                  {r.baseMonthlyCents != null && r.currency ? (
                    formatMoney(r.baseMonthlyCents, r.currency)
                  ) : (
                    <span className="text-muted-foreground">Not set</span>
                  )}
                </TableCell>
                <TableCell>
                  {r.cpfStatus ? (
                    <Badge variant="outline">
                      {CPF_STATUS_LABELS[r.cpfStatus]}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {r.effectiveDate ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setTarget({
                        employeeId: r.employeeId,
                        name: r.name,
                        cpfStatus: r.cpfStatus,
                      })
                    }
                  >
                    {r.baseMonthlyCents != null ? "Update" : "Set pay"}
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {target && (
        <SetCompensationDialog
          open={target !== null}
          onOpenChange={(o) => !o && setTarget(null)}
          employeeId={target.employeeId}
          employeeName={target.name}
          defaultCpfStatus={target.cpfStatus}
        />
      )}
    </div>
  )
}
