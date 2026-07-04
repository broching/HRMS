"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import { IconPlus, IconUserPlus } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatMoney, formatDocDate } from "@/features/payroll/lib/labels"
import { getErrorMessage } from "@/lib/errors"

// ─── Add an employee to the run ──────────────────────────────────────────────

export function AddEmployeeDialog({
  runId,
  open,
  onOpenChange,
}: {
  runId: Id<"payrollRuns">
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const candidates = useQuery(
    api.payroll.addableEmployees,
    open ? { runId } : "skip",
  )
  const addEmployee = useMutation(api.payroll.addEmployeeToRun)
  const [search, setSearch] = React.useState("")
  const [busyId, setBusyId] = React.useState<Id<"employees"> | null>(null)

  const filtered = (candidates ?? []).filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase()),
  )

  async function add(employeeId: Id<"employees">) {
    setBusyId(employeeId)
    try {
      await addEmployee({ runId, employeeId })
      toast.success("Employee added to the run")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't add employee"))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add employee to run</DialogTitle>
          <DialogDescription>
            Active employees with compensation on file who aren’t in this run yet.
          </DialogDescription>
        </DialogHeader>

        <Input
          placeholder="Search employees…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="max-h-80 overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Basic pay</TableHead>
                <TableHead className="w-20 text-right">{""}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {candidates === undefined ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground py-6 text-center">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground py-6 text-center">
                    No employees to add.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((e) => (
                  <TableRow key={e.employeeId}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{e.name}</span>
                        {e.positionTitle && (
                          <span className="text-muted-foreground text-xs">
                            {e.positionTitle}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatMoney(e.baseCents, e.currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === e.employeeId}
                        onClick={() => add(e.employeeId)}
                      >
                        <IconPlus className="size-4" />
                        Add
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Pick approved claims to pull into the run ───────────────────────────────

export function ClaimsPickerDialog({
  runId,
  open,
  onOpenChange,
}: {
  runId: Id<"payrollRuns">
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const claims = useQuery(api.payroll.claimsForRun, open ? { runId } : "skip")
  const pullClaims = useMutation(api.payroll.pullClaims)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [busy, setBusy] = React.useState(false)

  // Clear the selection whenever the dialog is (re)opened.
  React.useEffect(() => {
    if (open) setSelected(new Set())
  }, [open])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function pull() {
    setBusy(true)
    try {
      const added = await pullClaims({
        runId,
        claimIds: [...selected] as Id<"claims">[],
      })
      toast.success(
        added === 0
          ? "No claims added"
          : `Pulled ${added} claim${added === 1 ? "" : "s"} into the run`,
      )
      setSelected(new Set())
      onOpenChange(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't pull claims"))
    } finally {
      setBusy(false)
    }
  }

  const rows = claims ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Include claims in payroll</DialogTitle>
          <DialogDescription>
            Select approved claims for this period to reimburse through payroll.
            Reimbursed or already-added claims can’t be selected again.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-96 overflow-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">{""}</TableHead>
                <TableHead>Employee / claim</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {claims === undefined ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground py-6 text-center">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground py-6 text-center">
                    No claims for this period.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((c) => (
                  <TableRow
                    key={c.claimId}
                    className={c.eligible ? "cursor-pointer" : undefined}
                    onClick={c.eligible ? () => toggle(c.claimId) : undefined}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selected.has(c.claimId)}
                        disabled={!c.eligible}
                        onCheckedChange={() => toggle(c.claimId)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Select claim"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{c.employeeName}</span>
                        <span className="text-muted-foreground text-xs">
                          {c.claimType}
                          {c.description ? ` — ${c.description}` : ""}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDocDate(c.incurredDate)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatMoney(c.amountCents, c.currency)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {c.reimbursed ? (
                          <Badge variant="secondary">Reimbursed</Badge>
                        ) : (
                          <Badge variant="outline">Approved</Badge>
                        )}
                        {c.alreadyPulled && !c.reimbursed && (
                          <Badge variant="secondary">Added</Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={pull} disabled={busy || selected.size === 0}>
            <IconUserPlus className="size-4" />
            {selected.size > 0
              ? `Include ${selected.size} claim${selected.size === 1 ? "" : "s"}`
              : "Include claims"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
