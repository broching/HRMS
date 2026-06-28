"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import { IconPlus } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  PAYROLL_STATUS_BADGE,
  PAYROLL_STATUS_LABELS,
  formatMoney,
  currentPeriodMonth,
} from "@/features/payroll/lib/labels"

function NewRunDialog() {
  const router = useRouter()
  const createRun = useMutation(api.payroll.createRun)
  const [open, setOpen] = React.useState(false)
  const [period, setPeriod] = React.useState(currentPeriodMonth())
  const [label, setLabel] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function submit() {
    setBusy(true)
    try {
      const id = await createRun({
        periodMonth: period,
        label: label || undefined,
      })
      toast.success("Payroll run created")
      setOpen(false)
      router.push(`/payroll/runs/${id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create run")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <IconPlus className="size-4" />
          New run
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New payroll run</DialogTitle>
          <DialogDescription>
            Generates draft payslips for every active employee with compensation
            on file.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="r-period">Period</Label>
            <Input
              id="r-period"
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="r-label">Label (optional)</Label>
            <Input
              id="r-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. June 2026 payroll"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            Create run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function PayrollRuns() {
  const runs = useQuery(api.payroll.listRuns)

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button asChild variant="outline">
          <Link href="/payroll/compensation">Manage compensation</Link>
        </Button>
        <NewRunDialog />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payslips</TableHead>
              <TableHead>Gross</TableHead>
              <TableHead>Net</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs === undefined ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : runs.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-muted-foreground py-8 text-center"
                >
                  No payroll runs yet.
                </TableCell>
              </TableRow>
            ) : (
              runs.map((r) => (
                <TableRow key={r._id}>
                  <TableCell>
                    <Link
                      href={`/payroll/runs/${r._id}`}
                      className="font-medium hover:underline"
                    >
                      {r.label}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={PAYROLL_STATUS_BADGE[r.status]}>
                      {PAYROLL_STATUS_LABELS[r.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{r.payslipCount}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatMoney(r.grossCents, r.currency)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatMoney(r.netCents, r.currency)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/payroll/runs/${r._id}`}>Open</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
