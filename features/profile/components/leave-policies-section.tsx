"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Skeleton } from "@/components/ui/skeleton"

export function LeavePoliciesSection({
  employeeId,
}: {
  employeeId: Id<"employees">
}) {
  const balances = useQuery(api.leaveBalances.forEmployee, { employeeId })
  const year = new Date().getFullYear()

  if (balances === undefined) {
    return <Skeleton className="h-32 w-full rounded-lg" />
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Leave policies</h2>
        <span className="text-muted-foreground text-sm">{year}</span>
      </div>

      {balances.length === 0 ? (
        <p className="text-muted-foreground text-sm">No leave types configured.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs uppercase">
                <th className="py-2 pr-4 font-medium">Leave type</th>
                <th className="py-2 pr-4 text-right font-medium">Entitled</th>
                <th className="py-2 pr-4 text-right font-medium">Carried</th>
                <th className="py-2 pr-4 text-right font-medium">Taken</th>
                <th className="py-2 pr-4 text-right font-medium">Pending</th>
                <th className="py-2 text-right font-medium">Available</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b) => (
                <tr key={b.leaveTypeId} className="border-b last:border-0">
                  <td className="py-2 pr-4">
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: b.color }}
                      />
                      {b.leaveTypeName}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {b.entitledDays + b.adjustmentDays}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {b.carriedForwardDays}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{b.takenDays}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{b.pendingDays}</td>
                  <td className="py-2 text-right font-medium tabular-nums">
                    {b.availableDays}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
