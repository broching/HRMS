"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { toast } from "sonner"
import { IconTrash, IconPlus, IconChevronDown } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { dollarsToCents, centsToInput } from "@/features/payroll/lib/labels"

type Options = FunctionReturnType<typeof api.claimSettings.options>

// ─── Generic multi-select on a list of {value,label} ─────────────────────────

function MultiSelect({
  options,
  selected,
  onChange,
  placeholder,
}: {
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (next: string[]) => void
  placeholder: string
}) {
  const selectedLabels = options
    .filter((o) => selected.includes(o.value))
    .map((o) => o.label)
  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-auto min-h-9 w-full justify-between font-normal"
        >
          <span className="flex flex-wrap gap-1">
            {selectedLabels.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              selectedLabels.map((l) => (
                <Badge key={l} variant="secondary">
                  {l}
                </Badge>
              ))
            )}
          </span>
          <IconChevronDown className="size-4 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-auto">
        {options.length === 0 ? (
          <div className="text-muted-foreground px-2 py-1.5 text-sm">
            None available
          </div>
        ) : (
          options.map((o) => (
            <DropdownMenuCheckboxItem
              key={o.value}
              checked={selected.includes(o.value)}
              onCheckedChange={() => toggle(o.value)}
              onSelect={(e) => e.preventDefault()}
            >
              {o.label}
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Form state ──────────────────────────────────────────────────────────────

type RuleForm = { amount: string; officeIds: Id<"offices">[] }
type StepForm = {
  approverType: "position" | "specific"
  value: string
  thresholdEnabled: boolean
  rules: RuleForm[]
}
type FormState = {
  cutoffDay: number
  validityMonths: number | null
  hrApproverUserIds: Id<"users">[]
  financeApproverUserIds: Id<"users">[]
  workflow: StepForm[]
  payrollMode: "manual" | "automatic"
  payrollItem: string
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-4 py-6 md:grid-cols-[280px_1fr]">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      </div>
      <div className="max-w-2xl">{children}</div>
    </div>
  )
}

function RadioRow({
  checked,
  onSelect,
  title,
  description,
}: {
  checked: boolean
  onSelect: () => void
  title: string
  description: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex items-start gap-3 text-left"
    >
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
          checked ? "border-primary" : "border-muted-foreground/40",
        )}
      >
        {checked && <span className="bg-primary size-2 rounded-full" />}
      </span>
      <span>
        <span className="text-sm font-medium">{title}</span>
        <span className="text-muted-foreground block text-sm">{description}</span>
      </span>
    </button>
  )
}

export function ClaimSettingsGeneral() {
  const data = useQuery(api.claimSettings.get)
  const options = useQuery(api.claimSettings.options)
  const save = useMutation(api.claimSettings.save)
  const [form, setForm] = React.useState<FormState | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (data && form === null) {
      setForm({
        cutoffDay: data.cutoffDay,
        validityMonths: data.transactionValidityMonths,
        hrApproverUserIds: data.hrApproverUserIds,
        financeApproverUserIds: data.financeApproverUserIds,
        workflow: data.approvalWorkflow.map((s) => ({
          approverType: s.approverType,
          value: s.value,
          thresholdEnabled: s.thresholdEnabled,
          rules: s.rules.map((r) => ({
            amount: centsToInput(r.amountMoreThanCents),
            officeIds: r.officeIds,
          })),
        })),
        payrollMode: data.payrollMode,
        payrollItem: data.payrollItem ?? "Expense Claims",
      })
    }
  }, [data, form])

  if (data === undefined || options === undefined || form === null) {
    return (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  const memberOpts = options.members.map((m) => ({
    value: m.userId as string,
    label: m.name,
  }))
  const officeOpts = options.offices.map((o) => ({
    value: o._id as string,
    label: o.name,
  }))

  function patch(p: Partial<FormState>) {
    setForm((f) => (f ? { ...f, ...p } : f))
  }
  function patchStep(i: number, p: Partial<StepForm>) {
    setForm((f) =>
      f
        ? { ...f, workflow: f.workflow.map((s, j) => (j === i ? { ...s, ...p } : s)) }
        : f,
    )
  }

  async function onSave() {
    if (!form) return
    setBusy(true)
    try {
      await save({
        cutoffDay: form.cutoffDay,
        transactionValidityMonths: form.validityMonths,
        hrApproverUserIds: form.hrApproverUserIds,
        financeApproverUserIds: form.financeApproverUserIds,
        approvalWorkflow: form.workflow.map((s) => ({
          approverType: s.approverType,
          value: s.value,
          thresholdEnabled: s.thresholdEnabled,
          rules: s.rules.map((r) => ({
            amountMoreThanCents: dollarsToCents(r.amount) ?? 0,
            officeIds: r.officeIds,
          })),
        })),
        payrollMode: form.payrollMode,
        payrollItem: form.payrollItem.trim() || null,
      })
      toast.success("Claim settings saved")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save settings")
    } finally {
      setBusy(false)
    }
  }

  const positionLabel = (s: StepForm) =>
    s.approverType === "position" ? "Position" : "Specific person"

  return (
    <div className="px-4 lg:px-6">
      <div className="divide-y rounded-lg border px-5">
        {/* Cut off date */}
        <Section
          title="Cut off date"
          description="Claims submitted after the cut-off are processed in the next claims cycle."
        >
          <div className="flex items-center gap-2">
            <Select
              value={String(form.cutoffDay)}
              onValueChange={(v) => patch({ cutoffDay: Number(v) })}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground text-sm">of every month</span>
          </div>
        </Section>

        {/* Transaction date validity */}
        <Section
          title="Transaction date validity"
          description="How far back a claim's transaction date may be. Older dates can't be keyed in."
        >
          <Select
            value={form.validityMonths === null ? "none" : String(form.validityMonths)}
            onValueChange={(v) =>
              patch({ validityMonths: v === "none" ? null : Number(v) })
            }
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No limit</SelectItem>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {m} month{m === 1 ? "" : "s"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Section>

        {/* Claim assignees */}
        <Section
          title="Claim assignees"
          description="People responsible for approving claims. Give them claims access in HR Lounge."
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>HR</Label>
              <MultiSelect
                options={memberOpts}
                selected={form.hrApproverUserIds as string[]}
                onChange={(v) =>
                  patch({ hrApproverUserIds: v as Id<"users">[] })
                }
                placeholder="Choose"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Finance</Label>
              <MultiSelect
                options={memberOpts}
                selected={form.financeApproverUserIds as string[]}
                onChange={(v) =>
                  patch({ financeApproverUserIds: v as Id<"users">[] })
                }
                placeholder="Choose"
              />
            </div>
          </div>
        </Section>

        {/* Approval workflow */}
        <Section
          title="Approval workflow"
          description="Set the approval chain for employees' claim reports. Higher tiers can apply only above a threshold."
        >
          <div className="flex flex-col gap-5">
            {form.workflow.map((step, i) => (
              <div key={i} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground w-24 text-sm">
                    {i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "3rd" : `${i + 1}th`}{" "}
                    Approver
                  </span>
                  <Select
                    value={step.approverType}
                    onValueChange={(v) =>
                      patchStep(i, {
                        approverType: v as "position" | "specific",
                        value: v === "position" ? "manager" : "",
                      })
                    }
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue>{positionLabel(step)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="position">Position</SelectItem>
                      <SelectItem value="specific">Specific person</SelectItem>
                    </SelectContent>
                  </Select>
                  {step.approverType === "position" ? (
                    <Select
                      value={step.value || "manager"}
                      onValueChange={(v) => patchStep(i, { value: v })}
                    >
                      <SelectTrigger className="w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="department_head">
                          Department head
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select
                      value={step.value}
                      onValueChange={(v) => patchStep(i, { value: v })}
                    >
                      <SelectTrigger className="w-44">
                        <SelectValue placeholder="Choose person" />
                      </SelectTrigger>
                      <SelectContent>
                        {options.members.map((m) => (
                          <SelectItem key={m.userId} value={m.userId}>
                            {m.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {i > 0 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive"
                      onClick={() =>
                        patch({
                          workflow: form.workflow.filter((_, j) => j !== i),
                        })
                      }
                    >
                      <IconTrash className="size-4" />
                    </Button>
                  )}
                </div>

                <label className="ml-24 flex w-fit items-center gap-2 text-sm">
                  <Checkbox
                    checked={step.thresholdEnabled}
                    onCheckedChange={(c) =>
                      patchStep(i, {
                        thresholdEnabled: c === true,
                        rules:
                          c === true && step.rules.length === 0
                            ? [{ amount: "", officeIds: [] }]
                            : step.rules,
                      })
                    }
                  />
                  Enable threshold
                </label>

                {step.thresholdEnabled && (
                  <div className="border-primary/40 ml-24 flex flex-col gap-3 border-l-2 bg-muted/40 p-3 text-sm">
                    <p className="text-muted-foreground">
                      This approver applies only once a claim exceeds the threshold
                      below.
                    </p>
                    {step.rules.map((rule, ri) => (
                      <div key={ri} className="flex flex-wrap items-end gap-3">
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs">Amount is more than</Label>
                          <Input
                            className="w-40"
                            inputMode="decimal"
                            placeholder="e.g. 400"
                            value={rule.amount}
                            onChange={(e) =>
                              patchStep(i, {
                                rules: step.rules.map((r, j) =>
                                  j === ri ? { ...r, amount: e.target.value } : r,
                                ),
                              })
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs">Offices (empty = all)</Label>
                          <div className="w-56">
                            <MultiSelect
                              options={officeOpts}
                              selected={rule.officeIds as string[]}
                              onChange={(v) =>
                                patchStep(i, {
                                  rules: step.rules.map((r, j) =>
                                    j === ri
                                      ? { ...r, officeIds: v as Id<"offices">[] }
                                      : r,
                                  ),
                                })
                              }
                              placeholder="All offices"
                            />
                          </div>
                        </div>
                        {step.rules.length > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-destructive"
                            onClick={() =>
                              patchStep(i, {
                                rules: step.rules.filter((_, j) => j !== ri),
                              })
                            }
                          >
                            <IconTrash className="size-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      className="text-primary w-fit text-sm font-medium"
                      onClick={() =>
                        patchStep(i, {
                          rules: [...step.rules, { amount: "", officeIds: [] }],
                        })
                      }
                    >
                      + Add rule
                    </button>
                  </div>
                )}
              </div>
            ))}
            <button
              type="button"
              className="text-primary w-fit text-sm font-medium"
              onClick={() =>
                patch({
                  workflow: [
                    ...form.workflow,
                    {
                      approverType: "position",
                      value: "manager",
                      thresholdEnabled: false,
                      rules: [],
                    },
                  ],
                })
              }
            >
              + Add approver
            </button>
          </div>
        </Section>

        {/* Payroll connection */}
        <Section
          title="Payroll connection"
          description="How an approved claim is sent to payroll, and which payroll item it maps to."
        >
          <div className="flex flex-col gap-4">
            <RadioRow
              checked={form.payrollMode === "manual"}
              onSelect={() => patch({ payrollMode: "manual" })}
              title="Manually send to payroll"
              description="Pull approved claims into a payroll run when you prepare it."
            />
            <RadioRow
              checked={form.payrollMode === "automatic"}
              onSelect={() => patch({ payrollMode: "automatic" })}
              title="Automatically send to payroll"
              description="Every fully-approved claim is queued for the next payroll run."
            />
            <div className="flex flex-col gap-1.5 pt-1">
              <Label>Reimbursement payroll item</Label>
              <Input
                className="max-w-xs"
                value={form.payrollItem}
                onChange={(e) => patch({ payrollItem: e.target.value })}
                placeholder="Expense Claims"
              />
            </div>
          </div>
        </Section>
      </div>

      <div className="mt-4 flex justify-start">
        <Button onClick={onSave} disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
  )
}
