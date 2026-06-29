"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useQuery } from "convex/react"
import { IconPlus, IconChevronRight } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { LeaveTypeDialog } from "./leave-type-dialog"

export function LeavePoliciesList() {
  const router = useRouter()
  const types = useQuery(api.leavePolicies.typesWithCounts, {})
  const [addOpen, setAddOpen] = React.useState(false)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium">Leave Policies</h2>
          <p className="text-muted-foreground text-sm">
            Click a leave type to configure its policies.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <IconPlus className="size-4" /> Add new leave type
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border">
        {types === undefined ? (
          <div className="flex flex-col gap-px">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : types.length === 0 ? (
          <p className="text-muted-foreground p-6 text-center text-sm">
            No leave types yet. Add one to get started.
          </p>
        ) : (
          types.map((t) => (
            <button
              key={t._id}
              onClick={() => router.push(`/hr-lounge/leave/policy/${t._id}`)}
              className="hover:bg-accent/40 flex w-full items-center justify-between border-b px-4 py-3.5 text-left last:border-b-0"
            >
              <span className="flex items-center gap-3">
                <span
                  className="size-3 rounded-full"
                  style={{ backgroundColor: t.color }}
                />
                <span className="font-medium">{t.name}</span>
                {t.isCredit && (
                  <Badge variant="secondary" className="text-[10px]">
                    CREDIT
                  </Badge>
                )}
              </span>
              <span className="text-muted-foreground flex items-center gap-3 text-sm">
                {t.policyCount} {t.policyCount === 1 ? "policy" : "policies"}
                <IconChevronRight className="size-4" />
              </span>
            </button>
          ))
        )}
      </div>

      <LeaveTypeDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  )
}
