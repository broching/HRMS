"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import {
  IconPlus,
  IconCalendarEvent,
  IconFileDollar,
  IconTrash,
  IconSettings,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { getErrorMessage } from "@/lib/errors"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  formatDocDate,
  currentPeriodMonth,
  splitPeriod,
} from "@/features/payroll/lib/labels"

// Last calendar day of the current month, as "YYYY-MM-DD".
function currentPaydayISO(): string {
  const d = new Date()
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`
}

function NewRunDialog({ trigger }: { trigger: React.ReactNode }) {
  const router = useRouter()
  const createRun = useMutation(api.payroll.createRun)
  const templates = useQuery(api.payslipTemplates.list)
  const [open, setOpen] = React.useState(false)
  const [period, setPeriod] = React.useState(currentPeriodMonth())
  const [label, setLabel] = React.useState("")
  const [templateId, setTemplateId] = React.useState<string>("")
  const [busy, setBusy] = React.useState(false)

  // Default the picker to the org's default template once loaded.
  React.useEffect(() => {
    if (open && templates && templates.length > 0 && !templateId) {
      setTemplateId((templates.find((t) => t.isDefault) ?? templates[0])._id)
    }
  }, [open, templates, templateId])

  async function submit() {
    setBusy(true)
    try {
      const id = await createRun({
        periodMonth: period,
        label: label || undefined,
        templateId: templateId
          ? (templateId as Id<"payslipTemplates">)
          : undefined,
      })
      toast.success("Payroll run created")
      setOpen(false)
      router.push(`/hr-lounge/payroll/runs/${id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create run")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Run payroll</DialogTitle>
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
          {templates && templates.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label>Payslip template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t._id} value={t._id}>
                      {t.name}
                      {t.isDefault ? " (default)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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

function RunCard(props: {
  runId: Id<"payrollRuns">
  href: string
  label: string
  status: keyof typeof PAYROLL_STATUS_LABELS
  payslipCount: number
  grossCents: number
  currency: string
}) {
  const deleteRun = useMutation(api.payroll.deleteRun)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const isDraft = props.status === "draft"

  async function remove() {
    try {
      await deleteRun({ runId: props.runId })
      toast.success("Draft deleted")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't delete draft"))
      throw e
    }
  }

  return (
    <div className="relative">
      <Link
        href={props.href}
        className="hover:border-primary/40 hover:bg-muted/40 block rounded-lg border p-4 transition-colors"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold">{props.label}</p>
            <p className="text-muted-foreground text-xs">
              {props.payslipCount} employee{props.payslipCount === 1 ? "" : "s"}
            </p>
          </div>
          <Badge variant={PAYROLL_STATUS_BADGE[props.status]}>
            {PAYROLL_STATUS_LABELS[props.status]}
          </Badge>
        </div>
        <div className="mt-4">
          <p className="text-muted-foreground text-xs">Total payout</p>
          <p className="text-lg font-semibold tabular-nums">
            {formatMoney(props.grossCents, props.currency)}
          </p>
        </div>
      </Link>

      {isDraft && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive absolute right-2 bottom-2 size-8"
            aria-label="Delete draft"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setConfirmOpen(true)
            }}
          >
            <IconTrash className="size-4" />
          </Button>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title={`Delete ${props.label}?`}
            description="This permanently removes the draft run and its payslips. This can't be undone."
            confirmLabel="Delete draft"
            destructive
            onConfirm={remove}
          />
        </>
      )}
    </div>
  )
}

export function PayrollRuns() {
  const runs = useQuery(api.payroll.listRuns)
  const [year, setYear] = React.useState<string>("all")

  const years = React.useMemo(() => {
    if (!runs) return []
    return Array.from(new Set(runs.map((r) => splitPeriod(r.periodMonth).year))).sort(
      (a, b) => Number(b) - Number(a),
    )
  }, [runs])

  const filtered = React.useMemo(() => {
    if (!runs) return []
    return year === "all"
      ? runs
      : runs.filter((r) => splitPeriod(r.periodMonth).year === year)
  }, [runs, year])

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      {/* Upcoming payday + quick actions */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 py-5">
            <div className="flex items-center gap-3">
              <span className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-full">
                <IconCalendarEvent className="size-5" />
              </span>
              <div>
                <p className="text-muted-foreground text-xs">Upcoming payday</p>
                <p className="text-lg font-semibold">
                  {formatDocDate(currentPaydayISO())}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link href="/hr-lounge/payroll/settings">
                  <IconSettings className="size-4" />
                  Settings
                </Link>
              </Button>
              <NewRunDialog
                trigger={
                  <Button>
                    <IconPlus className="size-4" />
                    Run payroll
                  </Button>
                }
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between gap-3 py-5">
            <div className="flex items-center gap-3">
              <span className="bg-muted flex size-11 items-center justify-center rounded-full">
                <IconFileDollar className="size-5" />
              </span>
              <div>
                <p className="font-medium">Compensation</p>
                <p className="text-muted-foreground text-xs">
                  Manage salaries & allowances
                </p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/hr-lounge/payroll/compensation">Open</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Payroll history */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Payroll history</h2>
        {years.length > 0 && (
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All years</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {runs === undefined ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border py-12 text-center text-sm">
          No payroll runs yet. Run your first payroll above.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => (
            <RunCard
              key={r._id}
              runId={r._id}
              href={`/hr-lounge/payroll/runs/${r._id}`}
              label={r.label}
              status={r.status}
              payslipCount={r.payslipCount}
              grossCents={r.grossCents}
              currency={r.currency}
            />
          ))}
        </div>
      )}
    </div>
  )
}
