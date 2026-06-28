"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/shared/page-header"
import {
  CPF_STATUS_LABELS,
  PAYROLL_STATUS_BADGE,
  PAYROLL_STATUS_LABELS,
  formatMoney,
} from "@/features/payroll/lib/labels"

const TYPE_LABEL = {
  earning: "Earnings",
  deduction: "Deductions",
  employer: "Employer contributions",
} as const

export function PayslipDetail({ payslipId }: { payslipId: Id<"payslips"> }) {
  const slip = useQuery(api.payroll.getPayslip, { payslipId })

  if (slip === undefined) {
    return (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-80 w-full max-w-2xl" />
      </div>
    )
  }

  const groups = ["earning", "deduction", "employer"] as const

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Payslip · ${slip.periodMonth}`}
        description={`${slip.employeeName} · ${CPF_STATUS_LABELS[slip.cpfStatus]}`}
      >
        <Badge variant={PAYROLL_STATUS_BADGE[slip.status]}>
          {PAYROLL_STATUS_LABELS[slip.status]}
        </Badge>
      </PageHeader>

      <div className="px-4 lg:px-6">
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {groups.map((g) => {
              const lines = slip.lines.filter((l) => l.type === g)
              if (lines.length === 0) return null
              return (
                <div key={g} className="flex flex-col gap-1.5">
                  <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                    {TYPE_LABEL[g]}
                  </span>
                  {lines.map((l, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-sm"
                    >
                      <span>{l.label}</span>
                      <span
                        className={cn(
                          "tabular-nums",
                          l.type === "deduction" && "text-destructive",
                        )}
                      >
                        {l.type === "deduction" ? "−" : ""}
                        {formatMoney(l.amountCents, slip.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              )
            })}

            <div className="flex items-center justify-between border-t pt-3">
              <span className="font-medium">Gross pay</span>
              <span className="tabular-nums">
                {formatMoney(slip.grossCents, slip.currency)}
              </span>
            </div>
            <div className="flex items-center justify-between text-lg font-semibold">
              <span>Net pay</span>
              <span className="tabular-nums">
                {formatMoney(slip.netCents, slip.currency)}
              </span>
            </div>
            <p className="text-muted-foreground text-xs">
              CPF-eligible wage: {formatMoney(slip.cpfableWageCents, slip.currency)}.
              Employer CPF of {formatMoney(slip.employerCpfCents, slip.currency)}{" "}
              is paid on top and not deducted from your pay.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
