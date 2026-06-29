"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatMoney, CPF_STATUS_LABELS } from "@/features/payroll/lib/labels"
import { Field } from "./profile-fields"

export function CompensationSection({
  employeeId,
}: {
  employeeId: Id<"employees">
}) {
  const rows = useQuery(api.compensation.forProfile, { employeeId })

  if (rows === undefined) {
    return <Skeleton className="h-32 w-full rounded-lg" />
  }

  const current = rows[0]
  const history = rows.slice(1)

  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">Compensation</h2>

      {!current ? (
        <p className="text-muted-foreground text-sm">
          No compensation on file. Set by HR via Payroll → Compensation.
        </p>
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              label="Base monthly"
              value={formatMoney(current.baseMonthlyCents, current.currency)}
            />
            <Field label="CPF status" value={CPF_STATUS_LABELS[current.cpfStatus]} />
            <Field label="Effective date" value={current.effectiveDate} />
          </div>

          {current.allowances.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Allowances</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {current.allowances.map((a, i) => (
                  <Field
                    key={i}
                    label={a.name + (a.cpfable ? " (CPF)" : "")}
                    value={formatMoney(a.amountCents, current.currency)}
                  />
                ))}
              </div>
            </div>
          )}

          {history.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-muted-foreground text-sm font-medium">History</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground border-b text-left text-xs uppercase">
                      <th className="py-2 pr-4 font-medium">Effective</th>
                      <th className="py-2 pr-4 font-medium">Base monthly</th>
                      <th className="py-2 pr-4 font-medium">CPF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((c) => (
                      <tr key={c._id} className="border-b last:border-0">
                        <td className="py-2 pr-4">{c.effectiveDate}</td>
                        <td className="py-2 pr-4">
                          {formatMoney(c.baseMonthlyCents, c.currency)}
                        </td>
                        <td className="py-2 pr-4">
                          <Badge variant="outline">
                            {CPF_STATUS_LABELS[c.cpfStatus]}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
