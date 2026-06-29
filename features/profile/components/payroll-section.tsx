"use client"

import Link from "next/link"
import { useQuery } from "convex/react"
import { IconChevronRight } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  formatMoney,
  PAYROLL_STATUS_LABELS,
  PAYROLL_STATUS_BADGE,
} from "@/features/payroll/lib/labels"

function monthLabel(periodMonth: string): string {
  const [y, m] = periodMonth.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}

export function PayrollSection({ employeeId }: { employeeId: Id<"employees"> }) {
  const slips = useQuery(api.payroll.forEmployeeProfile, { employeeId })

  if (slips === undefined) {
    return <Skeleton className="h-32 w-full rounded-lg" />
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Payroll</h2>

      {slips.length === 0 ? (
        <p className="text-muted-foreground text-sm">No payslips yet.</p>
      ) : (
        <div className="rounded-lg border divide-y">
          {slips.map((s) => (
            <Link
              key={s._id}
              href={`/payslips/${s._id}`}
              className="hover:bg-accent/40 flex items-center justify-between gap-3 p-3 transition-colors"
            >
              <div className="flex flex-col">
                <span className="font-medium">{monthLabel(s.periodMonth)}</span>
                <span className="text-muted-foreground text-xs">
                  Net {formatMoney(s.netCents, s.currency)} · Gross{" "}
                  {formatMoney(s.grossCents, s.currency)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={PAYROLL_STATUS_BADGE[s.status]}>
                  {PAYROLL_STATUS_LABELS[s.status]}
                </Badge>
                <IconChevronRight className="text-muted-foreground size-4" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
