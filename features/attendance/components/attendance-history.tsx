"use client"

import { useQuery } from "convex/react"
import { IconPencil } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { RequestCorrectionDialog } from "@/features/attendance/components/request-correction-dialog"
import {
  ATTENDANCE_STATUS_BADGE,
  ATTENDANCE_STATUS_LABELS,
  formatDay,
  formatTime,
  formatDuration,
} from "@/features/attendance/lib/labels"

export function AttendanceHistory() {
  const rows = useQuery(api.attendance.myHistory)

  return (
    <Card className="mx-4 lg:mx-6">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Recent attendance</CardTitle>
        <RequestCorrectionDialog
          trigger={
            <Button variant="outline" size="sm">
              <IconPencil className="size-4" />
              Request correction
            </Button>
          }
        />
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>In</TableHead>
              <TableHead>Out</TableHead>
              <TableHead>Worked</TableHead>
              <TableHead>Office</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows === undefined ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-muted-foreground py-8 text-center"
                >
                  No attendance recorded yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r._id}>
                  <TableCell className="text-sm">
                    {formatDay(r.clockInAt)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatTime(r.clockInAt)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {r.clockOutAt ? formatTime(r.clockOutAt) : "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatDuration(r.workedMinutes)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.officeName ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={ATTENDANCE_STATUS_BADGE[r.status]}>
                      {ATTENDANCE_STATUS_LABELS[r.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
