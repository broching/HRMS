"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { toast } from "sonner"
import {
  IconCheck,
  IconDownload,
  IconChevronDown,
  IconChevronRight,
} from "@tabler/icons-react"
import { Input } from "@/components/ui/input"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
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
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import {
  PAYROLL_STATUS_BADGE,
  PAYROLL_STATUS_LABELS,
  formatMoney,
  toCsv,
  centsToCsv,
  downloadFile,
} from "@/features/payroll/lib/labels"
import { AdjustPayrollStep } from "@/features/payroll/components/adjust-payroll-step"

function initials(name: string) {
  const [a, b] = name.split(" ")
  return `${a?.[0] ?? ""}${b?.[0] ?? ""}`.toUpperCase()
}

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

type PayslipRow = Workspace["payslips"][number]

// Read-only breakdown shown when a review row is expanded.
function ReviewBreakdown({ p }: { p: PayslipRow }) {
  const additions = p.adjustments.filter((a) => a.kind === "addition")
  const deductions = p.adjustments.filter((a) => a.kind === "deduction")
  const Line = ({
    label,
    cents,
    muted,
  }: {
    label: string
    cents: number
    muted?: boolean
  }) => (
    <div
      className={`flex items-center justify-between px-2 py-1.5 text-sm ${
        muted ? "text-muted-foreground" : ""
      }`}
    >
      <span>{label}</span>
      <span className="tabular-nums">{formatMoney(cents, p.currency)}</span>
    </div>
  )
  return (
    <div className="bg-muted/30 flex flex-col gap-3 p-4">
      <div className="overflow-hidden rounded-md border bg-background">
        <Line label="Basic salary" cents={p.baseCents} />
        {p.allowances.map((al, i) => (
          <Line key={`al-${i}`} label={al.name} cents={al.amountCents} muted />
        ))}
        {additions.map((a) => (
          <Line key={a._id} label={a.label} cents={a.amountCents} muted />
        ))}
        {deductions.map((d) => (
          <Line key={d._id} label={`− ${d.label}`} cents={d.amountCents} muted />
        ))}
        <Line label="CPF (employee)" cents={p.employeeCpfCents} muted />
        <div className="bg-muted/40 flex items-center justify-between px-2 py-1.5 text-sm font-medium">
          <span>Net pay</span>
          <span className="tabular-nums">
            {formatMoney(p.netCents, p.currency)}
          </span>
        </div>
        <Line
          label="Employer CPF (not deducted)"
          cents={p.employerCpfCents}
          muted
        />
      </div>
    </div>
  )
}

function ReviewStep({ workspace }: { workspace: Workspace }) {
  const { payslips, run } = workspace
  const [search, setSearch] = React.useState("")
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())

  const filtered = payslips.filter((p) =>
    p.employeeName.toLowerCase().includes(search.toLowerCase()),
  )

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <Input
        placeholder="Search…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-xs"
      />
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
            {filtered.map((p) => {
              const isOpen = expanded.has(p.employeeId)
              return (
                <React.Fragment key={p._id}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => toggle(p.employeeId)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {isOpen ? (
                          <IconChevronDown className="size-4" />
                        ) : (
                          <IconChevronRight className="size-4" />
                        )}
                        {p.employeeName}
                      </div>
                    </TableCell>
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
                  {isOpen && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={6} className="p-0">
                        <ReviewBreakdown p={p} />
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <p className="text-muted-foreground text-sm">
        Totals — Gross {formatMoney(run.grossCents, run.currency)} · Employer CPF{" "}
        {formatMoney(run.employerCpfCents, run.currency)} · Net{" "}
        {formatMoney(run.netCents, run.currency)}
      </p>
    </div>
  )
}

function DownloadRow({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <div className="flex gap-2">{children}</div>
    </div>
  )
}

function PaymentStep({
  workspace,
  onComplete,
}: {
  workspace: Workspace
  onComplete: () => Promise<void>
}) {
  const { run, payslips } = workspace
  const variance = useQuery(api.payroll.varianceReport, { runId: run._id })
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [paySearch, setPaySearch] = React.useState("")
  const completed = run.status === "paid"

  const filteredPayments = payslips.filter((p) =>
    p.employeeName.toLowerCase().includes(paySearch.toLowerCase()),
  )

  const fileStem = `payroll-${run.periodMonth}`

  function downloadPayrollReport() {
    const csv = toCsv(
      ["Employee", "Basic", "Gross", "Employee CPF", "Employer CPF", "Net"],
      payslips.map((p) => [
        p.employeeName,
        centsToCsv(p.baseCents),
        centsToCsv(p.grossCents),
        centsToCsv(p.employeeCpfCents),
        centsToCsv(p.employerCpfCents),
        centsToCsv(p.netCents),
      ]),
    )
    downloadFile(`${fileStem}-report.csv`, csv)
  }

  function downloadVarianceReport() {
    if (!variance) return
    const csv = toCsv(
      ["Employee", "Previous net", "Current net", "Change"],
      variance.map((r) => [
        r.employeeName,
        r.previousNetCents === null ? "" : centsToCsv(r.previousNetCents),
        centsToCsv(r.currentNetCents),
        centsToCsv(r.deltaCents),
      ]),
    )
    downloadFile(`${fileStem}-variance.csv`, csv)
  }

  function downloadCpfFile() {
    const csv = toCsv(
      ["Employee", "CPF-able wage", "Employee CPF", "Employer CPF", "Total CPF"],
      payslips
        .filter((p) => p.employeeCpfCents > 0 || p.employerCpfCents > 0)
        .map((p) => [
          p.employeeName,
          centsToCsv(p.cpfableWageCents),
          centsToCsv(p.employeeCpfCents),
          centsToCsv(p.employerCpfCents),
          centsToCsv(p.employeeCpfCents + p.employerCpfCents),
        ]),
    )
    downloadFile(`${fileStem}-cpf.csv`, csv)
  }

  function downloadBankFile() {
    const csv = toCsv(
      ["Employee", "Net pay", "Currency"],
      payslips.map((p) => [p.employeeName, centsToCsv(p.netCents), p.currency]),
    )
    downloadFile(`${fileStem}-bank.csv`, csv)
  }

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <Card>
        <CardContent className="py-2">
          <DownloadRow
            title="Payroll report"
            description="Full breakdown for this pay period."
          >
            <Button variant="outline" size="sm" onClick={downloadPayrollReport}>
              <IconDownload className="size-4" />
              Download
            </Button>
          </DownloadRow>
          <Separator />
          <DownloadRow
            title="Variance report"
            description="Net-pay change vs. the previous run."
          >
            <Button
              variant="outline"
              size="sm"
              onClick={downloadVarianceReport}
              disabled={!variance}
            >
              <IconDownload className="size-4" />
              Download
            </Button>
          </DownloadRow>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-2">
          <p className="pt-2 font-semibold">Statutory reporting</p>
          <p className="text-muted-foreground text-sm">
            Contribution files for the relevant institutions.
          </p>
          <DownloadRow
            title="CPF"
            description="Employee + employer contributions for CPF Board."
          >
            <Button variant="outline" size="sm" onClick={downloadCpfFile}>
              <IconDownload className="size-4" />
              CSV
            </Button>
          </DownloadRow>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-2">
          <DownloadRow
            title="Bank file"
            description="Net-pay file for your disbursement bank."
          >
            <Button variant="outline" size="sm" onClick={downloadBankFile}>
              <IconDownload className="size-4" />
              Download
            </Button>
          </DownloadRow>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">Payments ({payslips.length})</p>
            <Input
              placeholder="Search…"
              value={paySearch}
              onChange={(e) => setPaySearch(e.target.value)}
              className="max-w-xs"
            />
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Net pay</TableHead>
                  <TableHead className="text-right">Payslip</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPayments.map((p) => (
                  <TableRow key={p._id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Avatar className="size-8">
                          <AvatarImage src={p.employeePhotoUrl ?? undefined} />
                          <AvatarFallback className="text-xs">
                            {initials(p.employeeName)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">{p.employeeName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatMoney(p.netCents, p.currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/payslips/${p._id}`}>View</Link>
                      </Button>
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/payslips/${p._id}`} target="_blank">
                          Download
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        {completed ? (
          <Badge variant="default" className="self-center">
            Completed{run.payDate ? ` · ${run.payDate}` : ""}
          </Badge>
        ) : (
          <Button onClick={() => setConfirmOpen(true)}>Complete payroll</Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Complete payroll?"
        description="This finalizes the run and releases payslips to all employees. You won't be able to edit it afterwards."
        confirmLabel="Complete payroll"
        onConfirm={onComplete}
      />
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

  // Finalize (if still draft) then release payslips. Throws on failure so the
  // confirm dialog stays open.
  async function completePayroll() {
    try {
      if (run.status === "draft") await finalize({ runId })
      await markPaid({ runId })
      toast.success("Payroll completed — payslips released")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't complete payroll")
      throw e
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
        <PaymentStep workspace={workspace} onComplete={completePayroll} />
      )}

      <div className="flex flex-wrap justify-between gap-2 px-4 lg:px-6">
        <Button variant="ghost" onClick={() => router.push("/hr-lounge/payroll")}>
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
