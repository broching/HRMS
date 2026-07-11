"use client"

import * as React from "react"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { IconTrash, IconChevronDown } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
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
import { getErrorMessage } from "@/lib/errors"

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
  const labels = options.filter((o) => selected.includes(o.value))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="h-auto min-h-9 w-full justify-between font-normal"
        >
          <span className="flex flex-wrap gap-1">
            {labels.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              labels.map((l) => (
                <Badge key={l.value} variant="secondary">
                  {l.label}
                </Badge>
              ))
            )}
          </span>
          <IconChevronDown className="size-4 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-72 w-[var(--radix-dropdown-menu-trigger-width)] overflow-auto">
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.value}
            checked={selected.includes(o.value)}
            onCheckedChange={() =>
              onChange(
                selected.includes(o.value)
                  ? selected.filter((v) => v !== o.value)
                  : [...selected, o.value],
              )
            }
            onSelect={(e) => e.preventDefault()}
          >
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type StepForm = {
  key: string
  approverType: "role" | "specific"
  roleId?: Id<"roles">
  userIds: Id<"users">[]
  requiresSignature: boolean
}

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

export function PayrollApprovalSettings() {
  const data = useQuery(api.payrollSettings.get)
  const options = useQuery(api.payrollApproval.approverOptions)
  const save = useMutation(api.payrollSettings.save)

  const [enabled, setEnabled] = React.useState(false)
  const [showSigsToEmployees, setShowSigsToEmployees] = React.useState(false)
  const [steps, setSteps] = React.useState<StepForm[] | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!data || steps !== null) return
    setEnabled(data.approval.enabled)
    setShowSigsToEmployees(data.showSignaturesToEmployees)
    setSteps(
      data.approval.steps.map((s) => ({
        key: newId(),
        approverType: s.approverType,
        roleId: s.roleId,
        userIds: s.userIds ?? [],
        requiresSignature: s.requiresSignature,
      })),
    )
  }, [data, steps])

  if (data === undefined || options === undefined || steps === null) {
    return <Skeleton className="h-80 w-full" />
  }

  const roleOpts = options.roles.map((r) => ({
    value: r._id as string,
    label: r.name,
  }))
  const memberOpts = options.members.map((m) => ({
    value: m.userId as string,
    label: m.name,
  }))

  function patchStep(i: number, p: Partial<StepForm>) {
    setSteps((s) => (s ? s.map((x, j) => (j === i ? { ...x, ...p } : x)) : s))
  }

  async function onSave() {
    if (!steps || !data) return
    for (const s of steps) {
      if (s.approverType === "role" && !s.roleId) {
        toast.error("Pick a role for each role step.")
        return
      }
      if (s.approverType === "specific" && s.userIds.length === 0) {
        toast.error("Pick at least one person for each specific step.")
        return
      }
    }
    setBusy(true)
    try {
      await save({
        shgFunds: data.shgFunds,
        sdl: data.sdl,
        showSignaturesToEmployees: showSigsToEmployees,
        approval: {
          enabled,
          steps: steps.map((s) => ({
            approverType: s.approverType,
            roleId: s.approverType === "role" ? s.roleId : undefined,
            userIds: s.approverType === "specific" ? s.userIds : undefined,
            requiresSignature: s.requiresSignature,
          })),
        },
      })
      toast.success("Approval flow saved")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <div className="rounded-lg border p-4">
        <label className="flex items-center justify-between">
          <div>
            <p className="font-medium">Require approval before release</p>
            <p className="text-muted-foreground text-sm">
              When on, each payslip must be approved (and signed, if required) by
              every step below before the run can be released to employees.
            </p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </label>
      </div>

      <div className="rounded-lg border p-4">
        <label className="flex items-center justify-between">
          <div>
            <p className="font-medium">Show signatures to employees</p>
            <p className="text-muted-foreground text-sm">
              When on, preparer and approver signatures are rendered on payslips
              employees view or download themselves. HR and approvers always see
              signatures.
            </p>
          </div>
          <Switch
            checked={showSigsToEmployees}
            onCheckedChange={setShowSigsToEmployees}
          />
        </label>
      </div>

      {enabled && (
        <div className="flex flex-col gap-3">
          {steps.map((step, i) => (
            <div
              key={step.key}
              className="flex flex-col gap-2 rounded-lg border p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground w-20 text-sm">
                  {i === 0
                    ? "1st"
                    : i === 1
                      ? "2nd"
                      : i === 2
                        ? "3rd"
                        : `${i + 1}th`}{" "}
                  Approver
                </span>
                <Select
                  value={step.approverType}
                  onValueChange={(v) =>
                    patchStep(i, {
                      approverType: v as "role" | "specific",
                      roleId: undefined,
                      userIds: [],
                    })
                  }
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="role">Role</SelectItem>
                    <SelectItem value="specific">Specific person(s)</SelectItem>
                  </SelectContent>
                </Select>
                {step.approverType === "role" ? (
                  <Select
                    value={(step.roleId as string) ?? ""}
                    onValueChange={(v) =>
                      patchStep(i, { roleId: v as Id<"roles"> })
                    }
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Choose role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOpts.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="w-64">
                    <MultiSelect
                      options={memberOpts}
                      selected={step.userIds as string[]}
                      onChange={(v) =>
                        patchStep(i, { userIds: v as Id<"users">[] })
                      }
                      placeholder="Choose person(s)"
                    />
                  </div>
                )}
                <Button
                  variant="outline"
                  size="icon"
                  className="text-destructive ml-auto size-8"
                  onClick={() =>
                    setSteps((s) => (s ? s.filter((_, j) => j !== i) : s))
                  }
                >
                  <IconTrash className="size-4" />
                </Button>
              </div>
              <label className="ml-24 flex w-fit items-center gap-2 text-sm">
                <Checkbox
                  checked={step.requiresSignature}
                  onCheckedChange={(c) =>
                    patchStep(i, { requiresSignature: c === true })
                  }
                />
                Require signature at this step
              </label>
            </div>
          ))}
          <button
            type="button"
            className="text-primary w-fit text-sm font-medium"
            onClick={() =>
              setSteps((s) => [
                ...(s ?? []),
                {
                  key: newId(),
                  approverType: "role",
                  userIds: [],
                  requiresSignature: true,
                },
              ])
            }
          >
            + Add approver
          </button>
        </div>
      )}

      <div>
        <Button onClick={onSave} disabled={busy}>
          {busy ? "Saving…" : "Save approval flow"}
        </Button>
      </div>
    </div>
  )
}
