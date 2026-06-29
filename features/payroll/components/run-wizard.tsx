"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useQuery, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { toast } from "sonner"
import { IconCheck, IconDownload } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PageHeader } from "@/components/shared/page-header"
import {
  PAYROLL_STATUS_BADGE,
  PAYROLL_STATUS_LABELS,
  formatMoney,
} from "@/features/payroll/lib/labels"
import { AdjustPayrollStep } from "@/features/payroll/components/adjust-payroll-step"

const STEPS = ["Adjust payroll", "Review & confirm", "Payment & submission"]

function Stepper({
  current,
  onStep,
}: {
  current: number
  onStep: (n: number) => void
}) {
  return (
    <div className="flex items-center justify-center gap-2 px-4 lg:px-6">
      {STEPS.map((label, i) => {
        const n = i + 1
        const done = n < current
        const active = n === current
        return (
          <React.Fragment key={label}>
            <button
              type="button"
              onClick={() => onStep(n)}
              className="flex items-center gap-2"
            >
              <span
                className={`flex size-8 items-center justify-center rounded-full border text-sm font-medium ${
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : done
                      ? "border-primary text-primary"
                      : "text-muted-foreground"
                }`}
              >
                {done ? <IconCheck className="size-4" /> : n}
              </span>
              <span
                className={`hidden text-sm sm:inline ${
                  active ? "font-medium" : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            </button>
            {n < STEPS.length && <span className="bg-border h-px w-8 sm:w-16" />}
          </React.Fragment>
        )
      })}
    </div>
  )
}

type Workspace = NonNullable<
  FunctionReturnType<typeof api.payroll.getRunWorkspace>
>

function ReviewStep({ workspace }: { workspace: Workspace }) {
  const { payslips, run } = workspace
  return (
    <div className="px-4 lg:px-6">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Basic pay</TableHead>
              <TableHead>Gross pay</TableHead>
              <TableHead>CPF (emp.)</TableHead>
              <TableHead>Employer CPF</TableHead>
              <TableHead>Net pay</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {payslips.map((p) => (
              <TableRow key={p._id}>
                <TableCell className="font-medium">{p.employeeName}</TableCell>
                <TableCell className="tabular-nums">
                  {formatMoney(p.baseCents, p.currency)}
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatMoney(p.grossCents, p.currency)}
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatMoney(p.employeeCpfCents, p.currency)}
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatMoney(p.employerCpfCents, p.currency)}
                </TableCell>
                <TableCell className="tabular-nums font-medium">
                  {formatMoney(p.netCents, p.currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-muted-foreground mt-3 text-sm">
        Totals — Gross {formatMoney(run.grossCents, run.currency)} · Employer CPF{" "}
        {formatMoney(run.employerCpfCents, run.currency)} · Net{" "}
        {formatMoney(run.netCents, run.currency)}
      </p>
    </div>
  )
}

function PaymentStep({
  workspace,
  onFinalize,
  onMarkPaid,
}: {
  workspace: Workspace
  onFinalize: () => void
  onMarkPaid: () => void
}) {
  const { run } = workspace
  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <div>
            <p className="font-medium">Payroll report</p>
            <p className="text-muted-foreground text-sm">
              Full breakdown for {run.label}.
            </p>
          </div>
          <Button variant="outline" disabled>
            <IconDownload className="size-4" />
            Download
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <div>
            <p className="font-medium">CPF submission file</p>
            <p className="text-muted-foreground text-sm">
              Employee + employer contributions for CPF Board.
            </p>
          </div>
          <Button variant="outline" disabled>
            <IconDownload className="size-4" />
            Download
          </Button>
        </CardContent>
      </Card>
      <p className="text-muted-foreground text-xs">
        Report &amp; statutory file generation is coming next.
      </p>

      <div className="flex flex-wrap gap-2">
        {run.status === "draft" && (
          <Button onClick={onFinalize}>Finalize payroll</Button>
        )}
        {run.status === "finalized" && (
          <Button onClick={onMarkPaid}>Mark as paid</Button>
        )}
        {run.status === "paid" && (
          <Badge variant="default" className="self-center">
            Paid{run.payDate ? ` · ${run.payDate}` : ""}
          </Badge>
        )}
      </div>
    </div>
  )
}

export function RunWizard({ runId }: { runId: Id<"payrollRuns"> }) {
  const router = useRouter()
  const workspace = useQuery(api.payroll.getRunWorkspace, { runId })
  const finalize = useMutation(api.payroll.finalizeRun)
  const markPaid = useMutation(api.payroll.markPaid)

  const [step, setStep] = React.useState(1)
  const initialised = React.useRef(false)

  React.useEffect(() => {
    if (workspace && !initialised.current) {
      initialised.current = true
      if (workspace.run.status !== "draft") setStep(3)
    }
  }, [workspace])

  if (workspace === undefined) {
    return (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (workspace === null) {
    return (
      <div className="px-4 lg:px-6">
        <p className="text-muted-foreground text-sm">Run not found.</p>
      </div>
    )
  }

  const { run } = workspace

  async function act(p: Promise<unknown>, ok: string) {
    try {
      await p
      toast.success(ok)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed")
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Run payroll — ${run.label}`}
        description={`Period ${run.periodMonth}`}
      >
        <Badge variant={PAYROLL_STATUS_BADGE[run.status]}>
          {PAYROLL_STATUS_LABELS[run.status]}
        </Badge>
      </PageHeader>

      <Stepper current={step} onStep={setStep} />

      {step === 1 && <AdjustPayrollStep workspace={workspace} />}
      {step === 2 && <ReviewStep workspace={workspace} />}
      {step === 3 && (
        <PaymentStep
          workspace={workspace}
          onFinalize={() => act(finalize({ runId }), "Payroll finalized")}
          onMarkPaid={() => act(markPaid({ runId }), "Marked as paid")}
        />
      )}

      <div className="flex flex-wrap justify-between gap-2 px-4 lg:px-6">
        <Button variant="ghost" onClick={() => router.push("/payroll")}>
          {step === 1 ? "Save as draft" : "Back to dashboard"}
        </Button>
        <div className="flex gap-2">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          {step < 3 && (
            <Button onClick={() => setStep(step + 1)}>
              {step === 2 ? "Confirm" : "Continue"}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
