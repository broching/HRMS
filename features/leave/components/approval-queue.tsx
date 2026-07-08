"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { IconPaperclip } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
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
import { formatLeaveRange } from "@/features/leave/lib/labels"
import { LeaveDetailPanel } from "@/features/leave-admin/components/leave-detail-panel"

export function ApprovalQueue() {
  const queue = useQuery(api.leaveRequests.approvalQueue)
  const [selected, setSelected] = React.useState<Id<"leaveRequests"> | null>(
    null,
  )

  return (
    <div className="mx-4 rounded-lg border lg:mx-6">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Dates</TableHead>
            <TableHead>Days</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead className="text-right">Decision</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {queue === undefined ? (
            <TableRow>
              <TableCell colSpan={6}>
                <Skeleton className="h-6 w-full" />
              </TableCell>
            </TableRow>
          ) : queue.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="text-muted-foreground py-8 text-center"
              >
                Nothing awaiting your approval.
              </TableCell>
            </TableRow>
          ) : (
            queue.map((r) => (
              <TableRow
                key={r._id}
                className="hover:bg-muted/40 cursor-pointer"
                onClick={() => setSelected(r._id)}
              >
                <TableCell className="font-medium">{r.employeeName}</TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: r.leaveTypeColor }}
                    />
                    {r.leaveTypeName}
                  </span>
                </TableCell>
                <TableCell className="text-sm">
                  {formatLeaveRange(
                    r.startDate,
                    r.endDate,
                    r.startHalf,
                    r.endHalf,
                  )}
                </TableCell>
                <TableCell className="tabular-nums">{r.totalDays}</TableCell>
                <TableCell className="max-w-[200px] truncate text-sm">
                  <span className="flex items-center gap-1">
                    {r.reason ?? "—"}
                    {r.attachmentUrl && (
                      <a
                        href={r.attachmentUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <IconPaperclip className="text-muted-foreground size-3.5" />
                      </a>
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelected(r._id)
                    }}
                  >
                    Review
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <LeaveDetailPanel
        requestId={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
