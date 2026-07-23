"use client"

import * as React from "react"
import { useQuery, useMutation, useConvex } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { toast } from "sonner"
import {
  IconRefresh,
  IconLock,
  IconLockOpen,
  IconAlertTriangle,
  IconFileTypePdf,
  IconFileSpreadsheet,
  IconFileTypeXml,
  IconDownload,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { Ir8aCategory } from "@/convex/lib/enums"
import { permitted } from "@/convex/lib/permissions"
import { useCurrentMember } from "@/hooks/use-current-member"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { getErrorMessage } from "@/lib/errors"
import { formatMoney } from "@/features/payroll/lib/labels"
import {
  IR8A_CATEGORIES,
  IR8A_CATEGORY_LABELS,
  IR8A_FLAG_LABELS,
} from "@/features/payroll/lib/ir8a-labels"
import {
  downloadIr8aPdf,
  downloadAllIr8aPdfs,
} from "@/features/payroll/lib/ir8a-pdf"
import { buildAisXml } from "@/features/payroll/lib/ir8a-ais-xml"

type ByYear = NonNullable<FunctionReturnType<typeof api.ir8a.getByYear>>
type FormRow = ByYear["forms"][number]

const SGD = "SGD"

type AisRow = FunctionReturnType<typeof api.ir8a.exportAisRows>[number]

const AIS_HEADERS = [
  "Full name",
  "NRIC/FIN",
  "Designation",
  "Date of birth",
  "Nationality",
  "Address",
  "Date of commencement",
  "Date of cessation",
  "Gross salary",
  "Bonus",
  "Director's fees",
  "Allowances (taxable)",
  "Commission",
  "Gratuity / ex-gratia",
  "Other income",
  "Gross remuneration",
  "Employee CPF",
]

function toCsv(rows: AisRow[]): string {
  const esc = (val: string | number) => {
    const s = String(val ?? "")
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [AIS_HEADERS.join(",")]
  for (const r of rows) {
    lines.push(
      [
        r.fullName,
        r.nric,
        r.designation,
        r.dob,
        r.nationality,
        r.address,
        r.commenceDate,
        r.ceaseDate,
        r.grossSalary,
        r.bonus,
        r.directorsFee,
        r.allowancesTaxable,
        r.commission,
        r.gratuityExGratia,
        r.otherIncome,
        r.grossRemuneration,
        r.employeeCpf,
      ]
        .map(esc)
        .join(","),
    )
  }
  return lines.join("\n")
}

// Year options: current year and the four prior (IR8A is filed for a prior
// calendar year), unioned with any year that already has a batch.
function yearOptions(batchYears: string[]): string[] {
  const now = new Date().getUTCFullYear()
  const set = new Set<string>(batchYears)
  for (let y = now; y >= now - 4; y--) set.add(String(y))
  return [...set].sort((a, b) => (a < b ? 1 : -1))
}

export function Ir8aForms() {
  const [year, setYear] = React.useState(() =>
    String(new Date().getUTCFullYear()),
  )
  const [reviewId, setReviewId] = React.useState<Id<"ir8aForms"> | null>(null)

  const convex = useConvex()
  const member = useCurrentMember()
  const canAis = permitted(member?.permissions, "payroll:ais")
  const org = useQuery(api.organizations.current)
  const orgName = org?.name ?? ""
  const payrollSettings = useQuery(api.payrollSettings.get)
  const aisEmployer = payrollSettings?.aisEmployer ?? false
  const batches = useQuery(api.ir8a.listBatches) ?? []
  const data = useQuery(api.ir8a.getByYear, { year })
  const generate = useMutation(api.ir8a.generate)
  const finalize = useMutation(api.ir8a.finalize)
  const reopen = useMutation(api.ir8a.reopen)

  const [busy, setBusy] = React.useState(false)
  const [confirmAction, setConfirmAction] = React.useState<
    "generate" | "finalize" | null
  >(null)
  const years = yearOptions(batches.map((b) => b.year))

  const batch = data?.batch ?? null
  const forms = data?.forms ?? []
  const isFinalized = batch?.status === "finalized"
  const reviewForm = forms.find((f) => f._id === reviewId) ?? null

  async function handleGenerate() {
    setBusy(true)
    try {
      const { formCount } = await generate({ year })
      toast.success(`Generated ${formCount} IR8A form${formCount === 1 ? "" : "s"} for ${year}`)
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not generate IR8A forms"))
    } finally {
      setBusy(false)
    }
  }

  async function handleFinalize() {
    if (!batch) return
    setBusy(true)
    try {
      await finalize({ batchId: batch._id })
      toast.success(`IR8A ${year} finalized`)
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not finalize"))
    } finally {
      setBusy(false)
    }
  }

  async function handleReopen() {
    if (!batch) return
    setBusy(true)
    try {
      await reopen({ batchId: batch._id })
      toast.success(`IR8A ${year} reopened for editing`)
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not reopen"))
    } finally {
      setBusy(false)
    }
  }

  async function handleExportAis() {
    setBusy(true)
    try {
      const rows = await convex.query(api.ir8a.exportAisRows, { year })
      if (rows.length === 0) {
        toast.error("No finalized IR8A records to export")
        return
      }
      const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `IR8A-AIS ${year}.csv`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Exported ${rows.length} AIS record${rows.length === 1 ? "" : "s"}`)
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not export AIS file"))
    } finally {
      setBusy(false)
    }
  }

  async function handleExportAisXml() {
    setBusy(true)
    try {
      const rows = await convex.query(api.ir8a.exportAisRows, { year })
      if (rows.length === 0) {
        toast.error("No finalized IR8A records to export")
        return
      }
      const blob = new Blob([buildAisXml(rows, orgName, year)], {
        type: "application/xml;charset=utf-8",
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `IR8A-AIS ${year}.xml`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Exported ${rows.length} AIS record${rows.length === 1 ? "" : "s"} (XML)`)
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not export AIS XML"))
    } finally {
      setBusy(false)
    }
  }

  const flaggedCount = forms.filter((f) => f.flags.length > 0).length

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={y}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {batch && (
          <Badge variant={isFinalized ? "default" : "secondary"}>
            {isFinalized ? "Finalized" : "Draft"}
          </Badge>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant={batch ? "outline" : "default"}
            disabled={busy || isFinalized}
            onClick={() => setConfirmAction("generate")}
          >
            <IconRefresh className="size-4" />
            {batch ? "Regenerate" : "Generate"}
          </Button>
          {batch &&
            (isFinalized ? (
              <Button variant="outline" onClick={handleReopen} disabled={busy}>
                <IconLockOpen className="size-4" />
                Reopen
              </Button>
            ) : (
              <Button disabled={busy} onClick={() => setConfirmAction("finalize")}>
                <IconLock className="size-4" />
                Finalize
              </Button>
            ))}
          {batch && forms.length > 0 && (
            <Button
              variant="outline"
              onClick={() => downloadAllIr8aPdfs(forms, orgName, year, aisEmployer)}
            >
              <IconDownload className="size-4" />
              Download all PDFs
            </Button>
          )}
          {isFinalized && canAis && (
            <>
              <Button variant="outline" onClick={handleExportAisXml} disabled={busy}>
                <IconFileTypeXml className="size-4" />
                Export AIS (XML)
              </Button>
              <Button variant="outline" onClick={handleExportAis} disabled={busy}>
                <IconFileSpreadsheet className="size-4" />
                Export AIS (CSV)
              </Button>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmAction !== null}
        onOpenChange={(o) => !o && setConfirmAction(null)}
        title={
          confirmAction === "finalize"
            ? `Finalize IR8A for ${year}?`
            : batch
              ? `Regenerate IR8A for ${year}?`
              : `Generate IR8A for ${year}?`
        }
        description={
          confirmAction === "finalize"
            ? flaggedCount > 0
              ? `${flaggedCount} form${flaggedCount === 1 ? "" : "s"} still ${flaggedCount === 1 ? "has" : "have"} unresolved flags. You can finalize anyway, but review them first.`
              : "Locks the batch so it can be exported. You can reopen it later if needed."
            : batch
              ? "This replaces the current draft with a fresh roll-up of the year's finalized payslips. Manual edits will be lost."
              : "Rolls up each employee's finalized/paid payslips for the year into an IR8A form."
        }
        confirmLabel={
          confirmAction === "finalize"
            ? "Finalize"
            : batch
              ? "Regenerate"
              : "Generate"
        }
        destructive={confirmAction === "generate" && !!batch}
        onConfirm={confirmAction === "finalize" ? handleFinalize : handleGenerate}
      />

      {/* Body */}
      {data === undefined ? (
        <div className="rounded-lg border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="border-b p-3 last:border-b-0">
              <Skeleton className="h-8 w-full" />
            </div>
          ))}
        </div>
      ) : !batch ? (
        <div className="text-muted-foreground rounded-lg border border-dashed py-16 text-center text-sm">
          No IR8A forms generated for {year} yet. Click{" "}
          <span className="font-medium">Generate</span> to roll up the year&apos;s
          payroll.
        </div>
      ) : (
        <>
          {flaggedCount > 0 && (
            <div className="flex items-center gap-2 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <IconAlertTriangle className="size-4 shrink-0" />
              {flaggedCount} form{flaggedCount === 1 ? "" : "s"} need review — see
              the flags below.
            </div>
          )}
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="hidden md:table-cell">Designation</TableHead>
                  <TableHead className="text-right">Gross income</TableHead>
                  <TableHead className="text-right">Employee CPF</TableHead>
                  <TableHead>Flags</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {forms.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground py-10 text-center">
                      No employees had payroll income in {year}.
                    </TableCell>
                  </TableRow>
                ) : (
                  forms.map((f) => (
                    <TableRow key={f._id}>
                      <TableCell>
                        <div className="font-medium">{f.fullName}</div>
                        <div className="text-muted-foreground text-xs">
                          {f.idNumberMasked ?? "No ID on file"}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {f.designation ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(f.grossIncomeCents, SGD)}
                        {f.overridden && (
                          <span className="text-muted-foreground ml-1 text-xs">(edited)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(f.employeeCpfCents, SGD)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {f.flags.map((flag) => (
                            <Badge key={flag} variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">
                              {IR8A_FLAG_LABELS[flag] ?? flag}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            title="Download IR8A PDF"
                            onClick={() => downloadIr8aPdf(f, orgName, aisEmployer)}
                          >
                            <IconFileTypePdf className="size-4" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setReviewId(f._id)}>
                            Review
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <ReviewSheet
        form={reviewForm}
        readOnly={isFinalized}
        onClose={() => setReviewId(null)}
      />
    </div>
  )
}

// ─── Review drawer ───────────────────────────────────────────────────────────

function ReviewSheet({
  form,
  readOnly,
  onClose,
}: {
  form: FormRow | null
  readOnly: boolean
  onClose: () => void
}) {
  const update = useMutation(api.ir8a.updateForm)
  const [saving, setSaving] = React.useState(false)

  // Local editable state, seeded when a form opens.
  const [designation, setDesignation] = React.useState("")
  const [commenceDate, setCommenceDate] = React.useState("")
  const [ceaseDate, setCeaseDate] = React.useState("")
  const [fullId, setFullId] = React.useState("")
  const [amounts, setAmounts] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    if (!form) return
    setDesignation(form.designation ?? "")
    setCommenceDate(form.commenceDate ?? "")
    setCeaseDate(form.ceaseDate ?? "")
    setFullId("")
    const byCat: Record<string, string> = {}
    for (const c of IR8A_CATEGORIES) {
      const hit = form.incomeByCategory.find((x) => x.category === c)
      byCat[c] = hit ? (hit.cents / 100).toFixed(2) : ""
    }
    setAmounts(byCat)
  }, [form])

  if (!form) return null

  const editedGrossCents = IR8A_CATEGORIES.reduce((sum, c) => {
    const v = parseFloat(amounts[c] ?? "")
    return sum + (isNaN(v) ? 0 : Math.round(v * 100))
  }, 0)

  async function handleSave() {
    if (!form) return
    setSaving(true)
    try {
      const incomeByCategory = IR8A_CATEGORIES.map((category) => {
        const v = parseFloat(amounts[category] ?? "")
        return { category: category as Ir8aCategory, cents: isNaN(v) ? 0 : Math.round(v * 100) }
      }).filter((x) => x.cents !== 0)

      await update({
        formId: form._id,
        incomeByCategory,
        designation: designation.trim() || undefined,
        commenceDate: commenceDate || null,
        ceaseDate: ceaseDate || null,
        fullId: fullId.trim() || undefined,
      })
      toast.success("IR8A form updated")
      onClose()
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not save"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={!!form} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{form.fullName}</SheetTitle>
          <SheetDescription>
            IR8A {form.year} · {form.idNumberMasked ?? "No NRIC/FIN on file"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-4 py-2">
          {/* Missing-ID entry */}
          {!form.hasFullId && !readOnly && (
            <div className="rounded-md border border-amber-300/60 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
              <Label htmlFor="ir8a-fullid" className="text-amber-900 dark:text-amber-200">
                Enter full NRIC/FIN
              </Label>
              <Input
                id="ir8a-fullid"
                value={fullId}
                onChange={(e) => setFullId(e.target.value)}
                placeholder="e.g. S1234567D"
                className="mt-1.5"
              />
              <p className="mt-1 text-xs text-amber-800/80 dark:text-amber-200/70">
                Stored encrypted on the employee record; required for AIS submission.
              </p>
            </div>
          )}

          {/* Particulars */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="ir8a-designation">Designation</Label>
              <Input
                id="ir8a-designation"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                disabled={readOnly}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="ir8a-commence">Commenced (in {form.year})</Label>
              <Input
                id="ir8a-commence"
                type="date"
                value={commenceDate}
                onChange={(e) => setCommenceDate(e.target.value)}
                disabled={readOnly}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="ir8a-cease">Ceased (in {form.year})</Label>
              <Input
                id="ir8a-cease"
                type="date"
                value={ceaseDate}
                onChange={(e) => setCeaseDate(e.target.value)}
                disabled={readOnly}
                className="mt-1.5"
              />
            </div>
          </div>

          {/* Income by category */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Income by category (S$)</Label>
              <span className="text-muted-foreground text-xs">
                Gross: {formatMoney(editedGrossCents, SGD)}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {IR8A_CATEGORIES.map((c) => (
                <div key={c} className="flex items-center gap-2">
                  <span className="flex-1 text-sm">{IR8A_CATEGORY_LABELS[c]}</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={amounts[c] ?? ""}
                    onChange={(e) =>
                      setAmounts((prev) => ({ ...prev, [c]: e.target.value }))
                    }
                    disabled={readOnly}
                    className="w-32 text-right tabular-nums"
                    placeholder="0.00"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Source breakdown (transparency) */}
          <div>
            <Label className="text-muted-foreground text-xs">
              Source lines (from payslips)
            </Label>
            <div className="mt-1.5 flex flex-col gap-1 text-sm">
              {form.lineBreakdown.map((l, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className={l.mapped ? "" : "text-amber-700 dark:text-amber-300"}>
                    {l.label}
                    {!l.mapped && " (unclassified)"}
                  </span>
                  <span className="tabular-nums">{formatMoney(l.cents, SGD)}</span>
                </div>
              ))}
            </div>
            <div className="text-muted-foreground mt-2 flex items-center justify-between text-sm">
              <span>Employee CPF (deduction)</span>
              <span className="tabular-nums">{formatMoney(form.employeeCpfCents, SGD)}</span>
            </div>
          </div>
        </div>

        {!readOnly && (
          <SheetFooter className="mt-auto">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
