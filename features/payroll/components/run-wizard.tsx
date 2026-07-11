"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery, useMutation, useConvex } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { toast } from "sonner"
import {
  IconCheck,
  IconDownload,
  IconChevronDown,
  IconChevronRight,
  IconArrowLeft,
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
import { getErrorMessage } from "@/lib/errors"
import {
  buildDetailedWorkbook,
  downloadBlob,
} from "@/features/payroll/lib/payroll-excel"
import { buildPayslipsPdfZip } from "@/features/payroll/lib/payslip-pdf"
import { AdjustPayrollStep } from "@/features/payroll/components/adjust-payroll-step"
import { ApprovalsTable } from "@/features/payroll/components/approvals-table"
import { SignatureCaptureDialog } from "@/features/payroll/components/signature-pad"

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

// Read-only breakdown shown when a review row is expanded. Renders the
// authoritative computed payslip lines (base, allowances, additions, CPF, funds
// like CDAC/SDL, custom funds, deductions and employer contributions).
function ReviewBreakdown({ p }: { p: PayslipRow }) {
  const GROUPS = [
    { type: "earning", title: "Earnings" },
    { type: "deduction", title: "Deductions" },
    { type: "employer", title: "Employer contributions" },
  ] as const

  const pr = p.proration
  return (
    <div className="bg-muted/30 flex flex-col gap-3 p-4">
      {pr && (pr.prorated || pr.overridden) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-2 py-1.5 text-sm">
          <span className="flex items-center gap-2">
            <span className="text-muted-foreground">Prorated basic pay</span>
            {pr.overridden && (
              <Badge variant="outline" className="text-[10px]">
                edited
              </Badge>
            )}
          </span>
          <span className="text-muted-foreground text-xs">
            {formatMoney(p.fullBaseCents, p.currency)} × {pr.daysWorked}/
            {pr.totalWorkingDays} working days ={" "}
            <span className="text-foreground tabular-nums">
              {formatMoney(p.baseCents, p.currency)}
            </span>
          </span>
        </div>
      )}
      <div className="overflow-hidden rounded-md border bg-background">
        {GROUPS.map((g) => {
          const lines = p.lines.filter((l) => l.type === g.type)
          if (lines.length === 0) return null
          return (
            <div key={g.type}>
              <div className="text-muted-foreground bg-muted/40 px-2 py-1.5 text-xs font-medium uppercase">
                {g.title}
              </div>
              {lines.map((l, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-2 py-1.5 text-sm"
                >
                  <span className="flex items-center gap-2">
                    {l.label}
                    {l.category === "fund" && (
                      <Badge variant="outline" className="text-[10px]">
                        fund
                      </Badge>
                    )}
                  </span>
                  <span className="tabular-nums">
                    {l.type === "deduction" ? "−" : ""}
                    {formatMoney(l.amountCents, p.currency)}
                  </span>
                </div>
              ))}
            </div>
          )
        })}
        <div className="bg-muted/40 flex items-center justify-between px-2 py-1.5 text-sm font-medium">
          <span>Net pay</span>
          <span className="tabular-nums">
            {formatMoney(p.netCents, p.currency)}
          </span>
        </div>
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

function PaymentStep({ workspace }: { workspace: Workspace }) {
  const { run, payslips } = workspace
  const convex = useConvex()
  const variance = useQuery(api.payroll.varianceReport, { runId: run._id })
  const signatures = useQuery(api.payrollApproval.runSignatures, {
    runId: run._id,
  })
  const [paySearch, setPaySearch] = React.useState("")
  const [xlsxBusy, setXlsxBusy] = React.useState(false)
  const [zipBusy, setZipBusy] = React.useState(false)

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

  // Detailed Excel workbook: one row per employee with a column per distinct
  // line item (earnings → gross → deductions → net → employer), plus currency,
  // exchange rate + date, and net in base currency. Approver signatures are
  // embedded at the bottom once the run is approved.
  async function downloadDetailedBreakdown() {
    setXlsxBusy(true)
    try {
      const blob = await buildDetailedWorkbook({
        title: `Payroll — ${run.label}`,
        periodLabel: run.periodMonth,
        baseCurrency: run.currency,
        payslips: payslips.map((p) => ({
          employeeName: p.employeeName,
          currency: p.currency,
          baseCurrency: p.baseCurrency,
          exchangeRate: p.exchangeRate,
          exchangeRateDate: p.exchangeRateDate,
          grossCents: p.grossCents,
          netCents: p.netCents,
          lines: p.lines,
        })),
        signatures: signatures ?? [],
      })
      downloadBlob(`${fileStem}-detailed.xlsx`, blob)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't build the Excel file"))
    } finally {
      setXlsxBusy(false)
    }
  }

  // One PDF payslip per employee — the exact document the employee receives —
  // bundled into a single ZIP named after the pay period. Each file is
  // "{Employee} — {month}.pdf".
  async function downloadAllPayslips() {
    setZipBusy(true)
    try {
      const slips = await convex.query(api.payroll.getRunPayslipsForPrint, {
        runId: run._id,
      })
      if (slips.length === 0) {
        toast.info("No payslips to export.")
        return
      }
      const blob = await buildPayslipsPdfZip(slips, run.periodMonth)
      downloadBlob(`${fileStem}-payslips.zip`, blob)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't build the payslips ZIP"))
    } finally {
      setZipBusy(false)
    }
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
      {run.status !== "draft" && (
        <Card>
          <CardContent className="flex flex-col gap-3 py-4">
            <div>
              <p className="font-semibold">Approvals</p>
              <p className="text-muted-foreground text-sm">
                {run.status === "pending_approval"
                  ? "Each payslip must be approved and signed before release."
                  : run.status === "approved"
                    ? "All payslips approved — ready to release."
                    : "Payroll released."}
              </p>
            </div>
            <ApprovalsTable runId={run._id} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="py-2">
          <DownloadRow
            title="Payroll report"
            description="Employee-level totals for this pay period."
          >
            <Button variant="outline" size="sm" onClick={downloadPayrollReport}>
              <IconDownload className="size-4" />
              Download
            </Button>
          </DownloadRow>
          <Separator />
          <DownloadRow
            title="Detailed breakdown (Excel)"
            description="One row per employee — every line item inline, exchange rate + date per currency, and approver signatures once approved."
          >
            <Button
              variant="outline"
              size="sm"
              onClick={downloadDetailedBreakdown}
              disabled={xlsxBusy}
            >
              <IconDownload className="size-4" />
              {xlsxBusy ? "Building…" : "Download .xlsx"}
            </Button>
          </DownloadRow>
          <Separator />
          <DownloadRow
            title="Payslips (PDF ZIP)"
            description="One PDF payslip per employee — the exact document the employee receives — named by employee and pay month, bundled into a single ZIP."
          >
            <Button
              variant="outline"
              size="sm"
              onClick={downloadAllPayslips}
              disabled={zipBusy}
            >
              <IconDownload className="size-4" />
              {zipBusy ? "Zipping…" : "Download ZIP"}
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
    </div>
  )
}

export function RunWizard({ runId }: { runId: Id<"payrollRuns"> }) {
  const router = useRouter()
  const workspace = useQuery(api.payroll.getRunWorkspace, { runId })
  const completeRun = useMutation(api.payrollApproval.completeRun)
  const releaseRun = useMutation(api.payrollApproval.releaseRun)
  const getUploadUrl = useMutation(
    api.payrollApproval.generateSignatureUploadUrl,
  )

  const [step, setStep] = React.useState(1)
  const [signOpen, setSignOpen] = React.useState(false)
  const [releaseOpen, setReleaseOpen] = React.useState(false)
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

  // Complete the run: the preparer signs, and the approval chain (if any) is
  // snapshotted onto every payslip. Called from the signature dialog.
  async function onPreparerSigned(signatureStorageId: string) {
    try {
      await completeRun({
        runId,
        signatureStorageId: signatureStorageId as Id<"_storage">,
      })
      toast.success("Payroll completed — sent for approval")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't complete payroll"))
      throw e
    }
  }

  // Release an approved run to employees.
  async function release() {
    try {
      await releaseRun({ runId })
      toast.success("Payroll released — payslips available to employees")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't release payroll"))
      throw e
    }
  }

  const completed = run.status === "paid"

  return (
    <div className="flex flex-col gap-6">
      <div className="px-4 lg:px-6">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground -ml-2 gap-1"
          onClick={() => router.push("/hr-lounge/payroll")}
        >
          <IconArrowLeft className="size-4" />
          Back to dashboard
        </Button>
      </div>

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
      {step === 3 && <PaymentStep workspace={workspace} />}

      <div className="flex flex-wrap items-center justify-between gap-2 px-4 lg:px-6">
        <div>
          {step === 1 && (
            <Button
              variant="outline"
              onClick={() => router.push("/hr-lounge/payroll")}
            >
              Save as draft
            </Button>
          )}
        </div>
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
          {step === 3 &&
            (completed ? (
              <Badge variant="default" className="self-center">
                Released{run.payDate ? ` · ${run.payDate}` : ""}
              </Badge>
            ) : run.status === "draft" ? (
              <Button onClick={() => setSignOpen(true)}>Complete payroll</Button>
            ) : run.status === "approved" || run.status === "finalized" ? (
              <Button onClick={() => setReleaseOpen(true)}>
                Release to employees
              </Button>
            ) : (
              <Badge variant="outline" className="self-center">
                Pending approval
              </Badge>
            ))}
        </div>
      </div>

      <SignatureCaptureDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        title="Sign to complete payroll"
        description="Your signature is applied to every payslip as the preparer. Approvers then sign before release."
        confirmLabel="Complete & sign"
        getUploadUrl={() => getUploadUrl({})}
        onSigned={onPreparerSigned}
      />

      <ConfirmDialog
        open={releaseOpen}
        onOpenChange={setReleaseOpen}
        title="Release payroll?"
        description="This marks the run as paid and makes payslips visible to all employees. This can't be undone."
        confirmLabel="Release"
        onConfirm={release}
      />
    </div>
  )
}
