"use client"

import { getErrorMessage } from "@/lib/errors"
import * as React from "react"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { IconPlus, IconX } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { CpfStatus, PayType, ShgFundKey } from "@/convex/lib/enums"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
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
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  CPF_STATUS_LABELS,
  CPF_STATUS_OPTIONS,
  dollarsToCents,
} from "@/features/payroll/lib/labels"
import { CURRENCIES } from "@/features/claims/lib/labels"

type AllowanceRow = { name: string; amount: string; cpfable: boolean }
type DeductionRow = { name: string; amount: string; affectsGross: boolean }
type EmployerRow = { name: string; amount: string }
type CustomFundRow = {
  name: string
  kind: "deduction" | "employer"
  calc: "flat" | "percent"
  amount: string // flat dollars OR percent value depending on calc
  cap: string
}

// Weekdays in Mon-first order (value = JS getDay()).
const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
]

const SHG_LABELS: Record<ShgFundKey, string> = {
  cdac: "CDAC (Chinese)",
  sinda: "SINDA (Indian)",
  mbmf: "MBMF (Malay/Muslim)",
  ecf: "ECF (Eurasian)",
}

// Map the legacy `citizen_pr` value onto `citizen` so the picker (which only
// offers the split options) shows a valid selection for old records.
function coerceCpf(
  s: CpfStatus | null | undefined,
): Exclude<CpfStatus, "citizen_pr"> | null {
  if (s == null) return null
  return s === "citizen_pr" ? "citizen" : s
}

export function SetCompensationDialog({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  defaultCpfStatus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  employeeId: Id<"employees">
  employeeName: string
  defaultCpfStatus?: CpfStatus | null
}) {
  const setCompensation = useMutation(api.compensation.setCompensation)
  // Prefill funds / working days / deductions from the current record so they
  // carry over across salary changes.
  const history = useQuery(
    api.compensation.forProfile,
    open ? { employeeId } : "skip",
  )
  const current = history?.[0]
  const baseCurrencyQuery = useQuery(
    api.compensation.orgBaseCurrency,
    open ? {} : "skip",
  )
  const baseCurrency = baseCurrencyQuery?.currency ?? "SGD"

  const [effectiveDate, setEffectiveDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10),
  )
  const [payType, setPayType] = React.useState<PayType>("fixed")
  const [base, setBase] = React.useState("")
  const [hourlyRate, setHourlyRate] = React.useState("")
  const [cpf, setCpf] = React.useState<CpfStatus>(
    coerceCpf(defaultCpfStatus) ?? "citizen",
  )
  const [prStart, setPrStart] = React.useState("")
  const [currency, setCurrency] = React.useState("")
  const [exMode, setExMode] = React.useState<"auto" | "manual">("auto")
  const [manualRate, setManualRate] = React.useState("")
  const [allowances, setAllowances] = React.useState<AllowanceRow[]>([])
  const [workingDays, setWorkingDays] = React.useState<number[]>([1, 2, 3, 4, 5])
  const [shg, setShg] = React.useState<ShgFundKey | "none">("none")
  const [sdlEnabled, setSdlEnabled] = React.useState(true)
  const [customFunds, setCustomFunds] = React.useState<CustomFundRow[]>([])
  const [deductions, setDeductions] = React.useState<DeductionRow[]>([])
  const [employerContribs, setEmployerContribs] = React.useState<EmployerRow[]>(
    [],
  )
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const seeded = React.useRef(false)

  // Seed state from the current record once per open.
  React.useEffect(() => {
    if (!open) {
      seeded.current = false
      return
    }
    if (seeded.current || current === undefined || baseCurrencyQuery === undefined)
      return
    seeded.current = true
    setCpf(coerceCpf(current?.cpfStatus ?? defaultCpfStatus) ?? "citizen")
    setPrStart(current?.prStartDate ?? "")
    setCurrency(current?.currency ?? baseCurrency)
    setExMode(current?.exchangeMode ?? "auto")
    setManualRate(
      current?.manualRate != null ? String(current.manualRate) : "",
    )
    setPayType(current?.payType ?? "fixed")
    setBase(
      current && current.payType !== "hourly"
        ? (current.baseMonthlyCents / 100).toFixed(2)
        : "",
    )
    setHourlyRate(
      current?.hourlyRateCents != null
        ? (current.hourlyRateCents / 100).toFixed(2)
        : "",
    )
    setAllowances(
      (current?.allowances ?? []).map((a) => ({
        name: a.name,
        amount: (a.amountCents / 100).toFixed(2),
        cpfable: a.cpfable,
      })),
    )
    setWorkingDays(
      current?.workingDays && current.workingDays.length > 0
        ? current.workingDays
        : [1, 2, 3, 4, 5],
    )
    setShg(current?.funds?.shg ?? "none")
    setSdlEnabled(current?.funds?.sdlEnabled ?? true)
    setCustomFunds(
      (current?.funds?.custom ?? []).map((c) => ({
        name: c.name,
        kind: c.kind,
        calc: c.calc,
        amount:
          c.calc === "flat"
            ? ((c.amountCents ?? 0) / 100).toFixed(2)
            : String(c.percent ?? ""),
        cap: c.capCents != null ? (c.capCents / 100).toFixed(2) : "",
      })),
    )
    setDeductions(
      (current?.deductions ?? []).map((d) => ({
        name: d.name,
        amount: (d.amountCents / 100).toFixed(2),
        affectsGross: d.affectsGross,
      })),
    )
    setEmployerContribs(
      (current?.employerContributions ?? []).map((e) => ({
        name: e.name,
        amount: (e.amountCents / 100).toFixed(2),
      })),
    )
    setNote("")
  }, [open, current, defaultCpfStatus, baseCurrencyQuery])

  function toggleWeekday(value: number) {
    setWorkingDays((d) =>
      d.includes(value) ? d.filter((x) => x !== value) : [...d, value].sort(),
    )
  }

  async function submit() {
    const isHourly = payType === "hourly"
    const baseCents = isHourly ? 0 : dollarsToCents(base)
    if (baseCents === null) {
      toast.error("Enter a valid base salary.")
      return
    }
    const hourlyRateCents = isHourly ? dollarsToCents(hourlyRate) : null
    if (isHourly && (hourlyRateCents === null || hourlyRateCents <= 0)) {
      toast.error("Enter a valid hourly rate.")
      return
    }
    // Allowances
    const mappedAllowances: {
      name: string
      amountCents: number
      cpfable: boolean
    }[] = []
    for (const a of allowances) {
      if (!a.name.trim()) continue
      const cents = dollarsToCents(a.amount)
      if (cents === null) {
        toast.error(`Invalid amount for "${a.name}".`)
        return
      }
      mappedAllowances.push({
        name: a.name.trim(),
        amountCents: cents,
        cpfable: a.cpfable,
      })
    }
    // Deductions
    const mappedDeductions: {
      name: string
      amountCents: number
      affectsGross: boolean
    }[] = []
    for (const d of deductions) {
      if (!d.name.trim()) continue
      const cents = dollarsToCents(d.amount)
      if (cents === null) {
        toast.error(`Invalid amount for deduction "${d.name}".`)
        return
      }
      mappedDeductions.push({
        name: d.name.trim(),
        amountCents: cents,
        affectsGross: d.affectsGross,
      })
    }
    // Employer contributions
    const mappedEmployer: { name: string; amountCents: number }[] = []
    for (const e of employerContribs) {
      if (!e.name.trim()) continue
      const cents = dollarsToCents(e.amount)
      if (cents === null) {
        toast.error(`Invalid amount for employer contribution "${e.name}".`)
        return
      }
      mappedEmployer.push({ name: e.name.trim(), amountCents: cents })
    }
    // Custom funds
    const mappedCustom: {
      name: string
      kind: "deduction" | "employer"
      calc: "flat" | "percent"
      amountCents?: number
      percent?: number
      capCents?: number
    }[] = []
    for (const c of customFunds) {
      if (!c.name.trim()) continue
      const capCents = c.cap.trim() ? dollarsToCents(c.cap) : null
      if (c.cap.trim() && capCents === null) {
        toast.error(`Invalid cap for fund "${c.name}".`)
        return
      }
      if (c.calc === "flat") {
        const cents = dollarsToCents(c.amount)
        if (cents === null) {
          toast.error(`Invalid amount for fund "${c.name}".`)
          return
        }
        mappedCustom.push({
          name: c.name.trim(),
          kind: c.kind,
          calc: "flat",
          amountCents: cents,
          capCents: capCents ?? undefined,
        })
      } else {
        const pct = Number(c.amount)
        if (Number.isNaN(pct) || pct < 0) {
          toast.error(`Invalid percent for fund "${c.name}".`)
          return
        }
        mappedCustom.push({
          name: c.name.trim(),
          kind: c.kind,
          calc: "percent",
          percent: pct,
          capCents: capCents ?? undefined,
        })
      }
    }

    if (cpf === "pr" && !prStart) {
      toast.error("Enter the date this employee became a PR.")
      return
    }

    const isForeign = !!currency && currency !== baseCurrency
    const manualRateNum = Number(manualRate)
    if (isForeign && exMode === "manual" && !(manualRateNum > 0)) {
      toast.error("Enter a valid default exchange rate, or use auto.")
      return
    }

    setBusy(true)
    try {
      await setCompensation({
        employeeId,
        effectiveDate,
        payType,
        baseMonthlyCents: baseCents,
        hourlyRateCents: isHourly ? (hourlyRateCents ?? 0) : undefined,
        allowances: mappedAllowances,
        cpfStatus: cpf,
        prStartDate: cpf === "pr" ? prStart : undefined,
        currency: currency || undefined,
        exchangeMode: isForeign ? exMode : undefined,
        manualRate:
          isForeign && exMode === "manual" ? manualRateNum : undefined,
        workingDays,
        funds: {
          shg: shg === "none" ? undefined : shg,
          sdlEnabled,
          custom: mappedCustom,
        },
        deductions: mappedDeductions,
        employerContributions: mappedEmployer,
        note: note || undefined,
      })
      toast.success("Compensation saved")
      onOpenChange(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Set compensation</DialogTitle>
          <DialogDescription>
            {employeeName} · creates a new effective-dated salary record.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {/* Pay basis + effective */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-eff">Effective date</Label>
              <Input
                id="c-eff"
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Pay basis</Label>
              <Select
                value={payType}
                onValueChange={(v) => setPayType(v as PayType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed monthly</SelectItem>
                  <SelectItem value="hourly">Hourly rate</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {payType === "hourly" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="c-rate">Hourly rate</Label>
                <Input
                  id="c-rate"
                  inputMode="decimal"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  placeholder="25.00"
                />
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="c-base">Base monthly</Label>
                <Input
                  id="c-base"
                  inputMode="decimal"
                  value={base}
                  onChange={(e) => setBase(e.target.value)}
                  placeholder="5000.00"
                />
              </div>
            )}
          </div>
          {payType === "hourly" && (
            <p className="text-muted-foreground -mt-3 text-xs">
              Pay is computed as hourly rate × hours worked. Enter each
              employee&apos;s hours during the payroll adjust stage.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>CPF status</Label>
              <Select value={cpf} onValueChange={(v) => setCpf(v as CpfStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CPF_STATUS_OPTIONS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {CPF_STATUS_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {cpf === "pr" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="c-pr">Singapore PR since</Label>
                <Input
                  id="c-pr"
                  type="date"
                  value={prStart}
                  onChange={(e) => setPrStart(e.target.value)}
                />
              </div>
            )}
          </div>
          {cpf === "pr" && (
            <p className="text-muted-foreground -mt-3 text-xs">
              CPF contributions are graduated for the first two years — Year 1
              (4% / 5%), Year 2 (9% / 15%), then full rates (17% / 20%) from Year
              3. The year is derived from this date at each pay run.
            </p>
          )}
          {cpf === "foreigner" && (
            <p className="text-muted-foreground -mt-3 text-xs">
              Foreigners (work-pass holders) have no CPF contributions.
            </p>
          )}

          {/* Pay currency + conversion */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Pay currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue placeholder={baseCurrency} />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                      {c === baseCurrency ? " (base)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {!!currency && currency !== baseCurrency && (
            <div className="border-primary/30 bg-muted/40 flex flex-col gap-2 rounded-lg border p-3">
              <p className="text-xs">
                Paid in {currency}; the payslip shows {currency}. A rate converts
                to {baseCurrency} for run totals — set/adjust it during each run.
              </p>
              <div className="flex gap-1 rounded-md border p-0.5">
                {(["auto", "manual"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setExMode(m)}
                    className={cn(
                      "flex-1 rounded px-2 py-1 text-xs font-medium capitalize",
                      exMode === m
                        ? "bg-background shadow-sm"
                        : "text-muted-foreground",
                    )}
                  >
                    {m === "auto" ? "Auto (live rate)" : "Manual rate"}
                  </button>
                ))}
              </div>
              {exMode === "manual" && (
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">
                    Default rate (1 {currency} = ? {baseCurrency})
                  </Label>
                  <Input
                    inputMode="decimal"
                    value={manualRate}
                    onChange={(e) => setManualRate(e.target.value)}
                    placeholder="e.g. 1.35"
                  />
                </div>
              )}
            </div>
          )}

          {/* Working days */}
          <div className="flex flex-col gap-1.5">
            <Label>Working days</Label>
            <p className="text-muted-foreground text-xs">
              Used to prorate pay for unpaid leave and partial months. Public
              holidays are treated as non-working.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => {
                const on = workingDays.includes(d.value)
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleWeekday(d.value)}
                    className={cn(
                      "h-8 w-12 rounded-md border text-sm",
                      on
                        ? "border-primary bg-primary text-primary-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {d.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Allowances */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Allowances</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setAllowances((a) => [
                    ...a,
                    { name: "", amount: "", cpfable: false },
                  ])
                }
              >
                <IconPlus className="size-4" />
                Add
              </Button>
            </div>
            {allowances.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={a.name}
                  onChange={(e) =>
                    setAllowances((rows) =>
                      rows.map((r, idx) =>
                        idx === i ? { ...r, name: e.target.value } : r,
                      ),
                    )
                  }
                  placeholder="Transport"
                  className="flex-1"
                />
                <Input
                  value={a.amount}
                  onChange={(e) =>
                    setAllowances((rows) =>
                      rows.map((r, idx) =>
                        idx === i ? { ...r, amount: e.target.value } : r,
                      ),
                    )
                  }
                  placeholder="200.00"
                  inputMode="decimal"
                  className="w-24"
                />
                <label className="flex items-center gap-1 text-xs">
                  <Switch
                    checked={a.cpfable}
                    onCheckedChange={(cpfable) =>
                      setAllowances((rows) =>
                        rows.map((r, idx) =>
                          idx === i ? { ...r, cpfable } : r,
                        ),
                      )
                    }
                  />
                  CPF
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setAllowances((rows) => rows.filter((_, idx) => idx !== i))
                  }
                  aria-label="Remove allowance"
                >
                  <IconX className="size-4" />
                </Button>
              </div>
            ))}
          </div>

          {/* Statutory funds */}
          <div className="flex flex-col gap-3 rounded-lg border p-3">
            <Label>Statutory funds</Label>
            <div className="flex flex-col gap-1.5">
              <span className="text-muted-foreground text-xs">
                Self-Help Group (employee deduction)
              </span>
              <Select
                value={shg}
                onValueChange={(v) => setShg(v as ShgFundKey | "none")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {(Object.keys(SHG_LABELS) as ShgFundKey[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {SHG_LABELS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center justify-between text-sm">
              <span>
                SDL{" "}
                <span className="text-muted-foreground text-xs">
                  (employer, 0.25% capped)
                </span>
              </span>
              <Switch checked={sdlEnabled} onCheckedChange={setSdlEnabled} />
            </label>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-xs">Custom funds</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setCustomFunds((c) => [
                    ...c,
                    {
                      name: "",
                      kind: "deduction",
                      calc: "flat",
                      amount: "",
                      cap: "",
                    },
                  ])
                }
              >
                <IconPlus className="size-4" />
                Add
              </Button>
            </div>
            {customFunds.map((c, i) => (
              <div
                key={i}
                className="flex flex-col gap-2 rounded-md border bg-muted/30 p-2"
              >
                <div className="flex items-center gap-2">
                  <Input
                    value={c.name}
                    onChange={(e) =>
                      setCustomFunds((rows) =>
                        rows.map((r, idx) =>
                          idx === i ? { ...r, name: e.target.value } : r,
                        ),
                      )
                    }
                    placeholder="Fund name"
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setCustomFunds((rows) => rows.filter((_, idx) => idx !== i))
                    }
                    aria-label="Remove fund"
                  >
                    <IconX className="size-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={c.kind}
                    onValueChange={(v) =>
                      setCustomFunds((rows) =>
                        rows.map((r, idx) =>
                          idx === i
                            ? { ...r, kind: v as "deduction" | "employer" }
                            : r,
                        ),
                      )
                    }
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="deduction">Deduction</SelectItem>
                      <SelectItem value="employer">Employer</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={c.calc}
                    onValueChange={(v) =>
                      setCustomFunds((rows) =>
                        rows.map((r, idx) =>
                          idx === i
                            ? { ...r, calc: v as "flat" | "percent" }
                            : r,
                        ),
                      )
                    }
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="flat">Flat $</SelectItem>
                      <SelectItem value="percent">% gross</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={c.amount}
                    onChange={(e) =>
                      setCustomFunds((rows) =>
                        rows.map((r, idx) =>
                          idx === i ? { ...r, amount: e.target.value } : r,
                        ),
                      )
                    }
                    placeholder={c.calc === "flat" ? "50.00" : "1.5"}
                    inputMode="decimal"
                    className="w-24"
                  />
                  <Input
                    value={c.cap}
                    onChange={(e) =>
                      setCustomFunds((rows) =>
                        rows.map((r, idx) =>
                          idx === i ? { ...r, cap: e.target.value } : r,
                        ),
                      )
                    }
                    placeholder="cap (opt)"
                    inputMode="decimal"
                    className="w-24"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Recurring deductions */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Recurring deductions</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setDeductions((d) => [
                    ...d,
                    { name: "", amount: "", affectsGross: false },
                  ])
                }
              >
                <IconPlus className="size-4" />
                Add
              </Button>
            </div>
            {deductions.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={d.name}
                  onChange={(e) =>
                    setDeductions((rows) =>
                      rows.map((r, idx) =>
                        idx === i ? { ...r, name: e.target.value } : r,
                      ),
                    )
                  }
                  placeholder="Loan recovery"
                  className="flex-1"
                />
                <Input
                  value={d.amount}
                  onChange={(e) =>
                    setDeductions((rows) =>
                      rows.map((r, idx) =>
                        idx === i ? { ...r, amount: e.target.value } : r,
                      ),
                    )
                  }
                  placeholder="100.00"
                  inputMode="decimal"
                  className="w-24"
                />
                <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                  <Switch
                    checked={d.affectsGross}
                    onCheckedChange={(affectsGross) =>
                      setDeductions((rows) =>
                        rows.map((r, idx) =>
                          idx === i ? { ...r, affectsGross } : r,
                        ),
                      )
                    }
                  />
                  Pre-CPF
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setDeductions((rows) => rows.filter((_, idx) => idx !== i))
                  }
                  aria-label="Remove deduction"
                >
                  <IconX className="size-4" />
                </Button>
              </div>
            ))}
          </div>

          {/* Employer contributions */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Employer contributions</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setEmployerContribs((e) => [...e, { name: "", amount: "" }])
                }
              >
                <IconPlus className="size-4" />
                Add
              </Button>
            </div>
            {employerContribs.map((e, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={e.name}
                  onChange={(ev) =>
                    setEmployerContribs((rows) =>
                      rows.map((r, idx) =>
                        idx === i ? { ...r, name: ev.target.value } : r,
                      ),
                    )
                  }
                  placeholder="Insurance"
                  className="flex-1"
                />
                <Input
                  value={e.amount}
                  onChange={(ev) =>
                    setEmployerContribs((rows) =>
                      rows.map((r, idx) =>
                        idx === i ? { ...r, amount: ev.target.value } : r,
                      ),
                    )
                  }
                  placeholder="150.00"
                  inputMode="decimal"
                  className="w-24"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setEmployerContribs((rows) =>
                      rows.filter((_, idx) => idx !== i),
                    )
                  }
                  aria-label="Remove employer contribution"
                >
                  <IconX className="size-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="c-note">Note</Label>
            <Input
              id="c-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Annual increment"
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            Save compensation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
