"use client"

import { useQuery, useMutation } from "convex/react"
import { IconPaperclip } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
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
  LEAVE_STATUS_BADGE,
  LEAVE_STATUS_LABELS,
  formatLeaveRange,
} from "@/features/leave/lib/labels"

export function MyLeaveRequests() {
  const requests = useQuery(api.leaveRequests.mine)
  const cancel = useMutation(api.leaveRequests.cancel)

  async function handleCancel(requestId: Id<"leaveRequests">) {
    try {
      await cancel({ requestId })
      toast.success("Request cancelled")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel")
    }
  }

  return (
    <div className="mx-4 rounded-lg border lg:mx-6">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Dates</TableHead>
            <TableHead>Days</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests === undefined ? (
            <TableRow>
              <TableCell colSpan={5}>
                <Skeleton className="h-6 w-full" />
              </TableCell>
            </TableRow>
          ) : requests.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={5}
                className="text-muted-foreground py-8 text-center"
              >
                No leave requests yet.
              </TableCell>
            </TableRow>
          ) : (
            requests.map((r) => (
              <TableRow key={r._id}>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: r.leaveTypeColor }}
                    />
                    {r.leaveTypeName}
                    {r.attachmentUrl && (
                      <a href={r.attachmentUrl} target="_blank" rel="noreferrer">
                        <IconPaperclip className="text-muted-foreground size-3.5" />
                      </a>
                    )}
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
                <TableCell>
                  <Badge variant={LEAVE_STATUS_BADGE[r.status]}>
                    {LEAVE_STATUS_LABELS[r.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {(r.status === "pending" || r.status === "approved") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancel(r._id)}
                    >
                      Cancel
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
