"use client"

import * as React from "react"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { toast } from "sonner"
import { IconCheck, IconSignature } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatMoney } from "@/features/payroll/lib/labels"
import { getErrorMessage } from "@/lib/errors"
import { SignatureCaptureDialog } from "@/features/payroll/components/signature-pad"

type ApprovalRow = NonNullable<
  FunctionReturnType<typeof api.payrollApproval.getRunApprovals>
>["payslips"][number]

type PendingAction =
  | { kind: "single"; payslipId: Id<"payslips"> }
  | { kind: "bulk"; payslipIds: Id<"payslips">[] }

export function ApprovalsTable({ runId }: { runId: Id<"payrollRuns"> }) {
  const data = useQuery(api.payrollApproval.getRunApprovals, { runId })
  const approve = useMutation(api.payrollApproval.approvePayslip)
  const approveBulk = useMutation(api.payrollApproval.approvePayslipsBulk)
  const getUploadUrl = useMutation(
    api.payrollApproval.generateSignatureUploadUrl,
  )

  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [sigOpen, setSigOpen] = React.useState(false)
  const pending = React.useRef<PendingAction | null>(null)

  if (data === undefined) return <Skeleton className="h-48 w-full" />
  if (data === null)
    return <p className="text-muted-foreground text-sm">Run not found.</p>

  const actionable = data.payslips.filter((p) => p.canAct)
  const selectableIds = actionable.map((p) => p._id as string)
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.has(id))

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(selectableIds))
  }

  async function runSingle(payslipId: Id<"payslips">, storageId?: string) {
    try {
      await approve({
        payslipId,
        signatureStorageId: storageId as Id<"_storage"> | undefined,
      })
      toast.success("Payslip approved")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't approve"))
    }
  }

  async function runBulk(payslipIds: Id<"payslips">[], storageId?: string) {
    try {
      const n = await approveBulk({
        payslipIds,
        signatureStorageId: storageId as Id<"_storage"> | undefined,
      })
      toast.success(`Approved ${n} payslip${n === 1 ? "" : "s"}`)
      setSelected(new Set())
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't approve"))
    }
  }

  // Decide whether a signature is needed, then either capture it or act now.
  function actSingle(row: ApprovalRow) {
    if (row.needsSignature) {
      pending.current = { kind: "single", payslipId: row._id }
      setSigOpen(true)
    } else {
      void runSingle(row._id)
    }
  }
  function actBulk() {
    const ids = actionable
      .filter((p) => selected.has(p._id as string))
      .map((p) => p._id)
    if (ids.length === 0) return
    const anyNeedsSig = actionable.some(
      (p) => selected.has(p._id as string) && p.needsSignature,
    )
    if (anyNeedsSig) {
      pending.current = { kind: "bulk", payslipIds: ids }
      setSigOpen(true)
    } else {
      void runBulk(ids)
    }
  }

  async function onSigned(storageId: string) {
    const action = pending.current
    pending.current = null
    if (!action) return
    if (action.kind === "single") await runSingle(action.payslipId, storageId)
    else await runBulk(action.payslipIds, storageId)
  }

  return (
    <div className="flex flex-col gap-3">
      {actionable.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-sm">
            {actionable.length} payslip{actionable.length === 1 ? "" : "s"}{" "}
            awaiting your approval
          </span>
          <Button
            size="sm"
            onClick={actBulk}
            disabled={selected.size === 0}
          >
            <IconSignature className="size-4" />
            Approve &amp; sign selected ({selected.size})
          </Button>
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                {actionable.length > 0 && (
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                )}
              </TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Net pay</TableHead>
              <TableHead>Approval progress</TableHead>
              <TableHead className="text-right">{""}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.payslips.map((p) => (
              <TableRow key={p._id}>
                <TableCell>
                  {p.canAct && (
                    <Checkbox
                      checked={selected.has(p._id as string)}
                      onCheckedChange={() => toggle(p._id as string)}
                    />
                  )}
                </TableCell>
                <TableCell className="font-medium">{p.employeeName}</TableCell>
                <TableCell className="tabular-nums">
                  {formatMoney(p.netCents, p.currency)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    {p.status === "approved" || p.status === "paid" ? (
                      <Badge variant="default" className="gap-1">
                        <IconCheck className="size-3" /> Approved
                      </Badge>
                    ) : (
                      p.chain.map((c, i) => (
                        <Badge
                          key={i}
                          variant={
                            i < p.currentStepIndex
                              ? "default"
                              : i === p.currentStepIndex
                                ? "outline"
                                : "secondary"
                          }
                          className="text-[10px]"
                          title={
                            c.decidedByName
                              ? `Signed by ${c.decidedByName}`
                              : undefined
                          }
                        >
                          {c.label}
                          {c.requiresSignature ? " ✍" : ""}
                        </Badge>
                      ))
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {p.canAct && (
                    <Button size="sm" variant="outline" onClick={() => actSingle(p)}>
                      {p.needsSignature ? (
                        <>
                          <IconSignature className="size-4" /> Approve &amp; sign
                        </>
                      ) : (
                        <>
                          <IconCheck className="size-4" /> Approve
                        </>
                      )}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <SignatureCaptureDialog
        open={sigOpen}
        onOpenChange={setSigOpen}
        title="Sign to approve"
        description="Your signature will be rendered on the payslip(s) you approve."
        confirmLabel="Approve & sign"
        getUploadUrl={() => getUploadUrl({})}
        onSigned={onSigned}
      />
    </div>
  )
}
