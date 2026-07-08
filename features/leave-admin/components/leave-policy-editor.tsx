"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery, useMutation } from "convex/react"
import { IconPlus, IconChevronLeft, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { FunctionReturnType } from "convex/server"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { AssignPolicyDialog } from "./assign-policy-dialog"
import { InitialBalancesDialog } from "./initial-balances-dialog"
import {
  LeaveApprovalChainEditor,
  newLeaveStepKey,
  type LeaveStepForm,
} from "./leave-approval-chain-editor"

type Policy = FunctionReturnType<typeof api.leavePolicies.listForType>[number]

// Local editable form — numeric-optional fields use number | undefined.
type Form = {
  name: string
  description: string
  availability: "all" | "groups"
  approvalChain: LeaveStepForm[]
  entitlementMode: "fixed" | "upon_request"
  entitlementDays: number
  toleranceDays: number | undefined
  earnedEnabled: boolean
  accrualType: "daily" | "monthly"
  proratedEnabled: boolean
  prorateMode: "started" | "completed" | "partial"
  carryForwardEnabled: boolean
  maxCarryForwardDays: number | undefined
  seniorityEnabled: boolean
  seniorityEffective: "period" | "anniversary"
  seniorityIncrementMode: "fixed" | "variable"
  seniorityRules: { afterYears: number; addDays: number }[]
  seniorityMaxDays: number | undefined
  rounding: "none" | "up" | "down" | "nearest_half"
  linkedLeaveTypeId: string
  useWorkingDays: boolean
  allowApplyInPast: boolean
  minAdvanceDays: number | undefined
  maxAdvanceDays: number | undefined
  maxConsecutiveDays: number | undefined
}

// Seed the approval-chain editor from the policy's saved chain, falling back to
// its legacy two-step approver modes for policies saved before the chain.
function policyChainToForm(p: Policy): LeaveStepForm[] {
  const raw =
    p.approvalChain && p.approvalChain.length > 0
      ? p.approvalChain
      : legacyChain(p)
  return raw.map((s) => ({
    key: newLeaveStepKey(),
    approverType: s.approverType,
    value: s.value,
    userIds: s.userIds ?? [],
    thresholdEnabled: s.thresholdEnabled,
    daysMoreThan: s.daysMoreThan != null ? String(s.daysMoreThan) : "",
  }))
}

function legacyChain(p: Policy): NonNullable<Policy["approvalChain"]> {
  const out: NonNullable<Policy["approvalChain"]> = []
  const modes = [
    [p.firstApproverMode, p.firstApproverValue] as const,
    [p.secondApproverMode, p.secondApproverValue] as const,
  ]
  for (const [mode, value] of modes) {
    if (mode === "manager" || mode === "department_head") {
      out.push({ approverType: "position", value: mode, thresholdEnabled: false })
    } else if (mode === "specific" && value) {
      out.push({
        approverType: "specific",
        value: "",
        userIds: [value as Id<"users">],
        thresholdEnabled: false,
      })
    }
  }
  if (out.length === 0) {
    out.push({ approverType: "position", value: "manager", thresholdEnabled: false })
  }
  return out
}

function toForm(p: Policy): Form {
  return {
    name: p.name,
    description: p.description ?? "",
    availability: p.availability,
    approvalChain: policyChainToForm(p),
    entitlementMode: p.entitlementMode,
    entitlementDays: p.entitlementDays,
    toleranceDays: p.toleranceDays,
    earnedEnabled: p.earnedEnabled,
    accrualType: p.accrualType ?? "monthly",
    proratedEnabled: p.proratedEnabled,
    prorateMode: p.prorateMode ?? "partial",
    carryForwardEnabled: p.carryForwardEnabled,
    maxCarryForwardDays: p.maxCarryForwardDays,
    seniorityEnabled: p.seniorityEnabled,
    seniorityEffective: p.seniorityEffective ?? "period",
    seniorityIncrementMode: p.seniorityIncrementMode ?? "fixed",
    seniorityRules:
      p.seniorityRules && p.seniorityRules.length > 0
        ? p.seniorityRules
        : [{ afterYears: 1, addDays: 1 }],
    seniorityMaxDays: p.seniorityMaxDays,
    rounding: p.rounding,
    linkedLeaveTypeId: p.linkedLeaveTypeId ?? "none",
    useWorkingDays: p.useWorkingDays,
    allowApplyInPast: p.allowApplyInPast,
    minAdvanceDays: p.minAdvanceDays,
    maxAdvanceDays: p.maxAdvanceDays,
    maxConsecutiveDays: p.maxConsecutiveDays,
  }
}

export function LeavePolicyEditor({
  leaveTypeId,
}: {
  leaveTypeId: Id<"leaveTypes">
}) {
  const leaveTypes = useQuery(api.leaveTypes.list, { includeInactive: true })
  const policies = useQuery(api.leavePolicies.listForType, { leaveTypeId })
  const approverOptions = useQuery(api.leavePolicies.approverOptions)
  const createPolicy = useMutation(api.leavePolicies.create)
  const updatePolicy = useMutation(api.leavePolicies.update)
  const removePolicy = useMutation(api.leavePolicies.remove)
  const updateType = useMutation(api.leaveTypes.update)

  const leaveType = leaveTypes?.find((t) => t._id === leaveTypeId)
  const [selectedId, setSelectedId] = React.useState<Id<"leavePolicies"> | null>(
    null,
  )
  const [assignOpen, setAssignOpen] = React.useState(false)
  const [balancesOpen, setBalancesOpen] = React.useState(false)
  const [addOpen, setAddOpen] = React.useState(false)
  const [newName, setNewName] = React.useState("")
  const [adding, setAdding] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)

  // Default selection = the default policy (or first).
  React.useEffect(() => {
    if (policies && policies.length > 0 && !selectedId) {
      setSelectedId(policies.find((p) => p.isDefault)?._id ?? policies[0]._id)
    }
  }, [policies, selectedId])

  const selected = policies?.find((p) => p._id === selectedId) ?? null

  if (leaveTypes === undefined || policies === undefined) {
    return <Skeleton className="h-96 w-full" />
  }

  async function handleAddPolicy() {
    const name = newName.trim()
    if (!name) return
    setAdding(true)
    try {
      const id = await createPolicy({ leaveTypeId, name })
      setSelectedId(id)
      setAddOpen(false)
      setNewName("")
      toast.success("Policy added")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add policy")
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-5 px-4 lg:px-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <Link
          href="/hr-lounge/leave"
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-sm"
        >
          <IconChevronLeft className="size-4" /> Leave Policies
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <span
              className="size-3.5 rounded-full"
              style={{ backgroundColor: leaveType?.color ?? "#888" }}
            />
            Leave type — {leaveType?.name ?? "…"}
          </h2>
          {leaveType && (
            <label className="flex items-center gap-2 text-sm">
              Auto assign
              <Switch
                checked={leaveType.autoAssign ?? false}
                onCheckedChange={(v) =>
                  updateType({ id: leaveTypeId, autoAssign: v }).then(
                    () => toast.success(v ? "Auto-assign on" : "Auto-assign off"),
                    () => toast.error("Could not update"),
                  )
                }
              />
            </label>
          )}
        </div>
      </div>

      {/* Tools */}
      <div className="grid gap-3 sm:grid-cols-2">
        <ToolCard
          title="Initial Balances"
          body="Set starting carried-forward and adjustment days per employee."
          action="Initial Balances"
          onClick={() => setBalancesOpen(true)}
        />
        <ToolCard
          title="Assign Policy"
          body="Assign a group policy to the relevant employees."
          action="Assign Policy"
          onClick={() => setAssignOpen(true)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        {/* Policy list rail */}
        <div className="flex flex-col gap-2">
          <h3 className="text-muted-foreground px-1 text-xs font-medium tracking-wide uppercase">
            Policy configurations
          </h3>
          {policies.map((p) => (
            <button
              key={p._id}
              onClick={() => setSelectedId(p._id)}
              className={cn(
                "flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm",
                p._id === selectedId
                  ? "border-primary/30 bg-primary/10 text-primary font-medium"
                  : "hover:bg-accent/40",
              )}
            >
              <span className="truncate">{p.name}</span>
              {p.isDefault && (
                <span className="text-muted-foreground text-[10px]">Default</span>
              )}
            </button>
          ))}
          <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            <IconPlus className="size-4" /> Add policy
          </Button>
        </div>

        {/* Policy form */}
        {selected ? (
          <PolicyForm
            key={selected._id}
            policy={selected}
            leaveTypes={leaveTypes.filter((t) => t._id !== leaveTypeId)}
            roleOpts={(approverOptions?.roles ?? []).map((r) => ({
              value: r._id as string,
              label: r.name,
            }))}
            memberOpts={(approverOptions?.members ?? []).map((m) => ({
              value: m.userId as string,
              label: m.name,
            }))}
            onSave={(patch) =>
              updatePolicy({ policyId: selected._id, ...patch }).then(
                () => toast.success("Policy saved"),
                (e) => toast.error(e?.message ?? "Could not save"),
              )
            }
            onDelete={
              selected.isDefault ? undefined : () => setDeleteOpen(true)
            }
          />
        ) : (
          <p className="text-muted-foreground text-sm">
            Select a policy to configure it.
          </p>
        )}
      </div>

      <AssignPolicyDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        leaveTypeId={leaveTypeId}
        policies={policies}
      />
      <InitialBalancesDialog
        open={balancesOpen}
        onOpenChange={setBalancesOpen}
        leaveTypeId={leaveTypeId}
      />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add policy</DialogTitle>
            <DialogDescription>
              Name this policy group (e.g. Managers).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="new-policy-name">Policy name</Label>
            <Input
              id="new-policy-name"
              autoFocus
              placeholder="e.g. Managers"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddPolicy()
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddPolicy} disabled={adding || !newName.trim()}>
              {adding ? "Adding…" : "Add policy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this policy?"
        description="Employees assigned to it will fall back to the default policy."
        confirmLabel="Delete policy"
        destructive
        onConfirm={async () => {
          if (!selected) return
          await removePolicy({ policyId: selected._id })
          setSelectedId(null)
          toast.success("Policy deleted")
        }}
      />
    </div>
  )
}

function ToolCard({
  title,
  body,
  action,
  onClick,
}: {
  title: string
  body: string
  action: string
  onClick: () => void
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground text-sm">{body}</p>
      </div>
      <Button variant="secondary" size="sm" className="self-start" onClick={onClick}>
        {action}
      </Button>
    </div>
  )
}

// ─── The big per-policy form ───────────────────────────────────────────────

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="bg-muted inline-flex rounded-lg p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm transition-colors",
            value === o.value
              ? "bg-background shadow-sm font-medium"
              : "text-muted-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Section({
  title,
  description,
  enabled,
  onToggle,
  children,
}: {
  title: string
  description?: string
  enabled?: boolean
  onToggle?: (v: boolean) => void
  children?: React.ReactNode
}) {
  return (
    <div className="border-b py-4 last:border-b-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">{title}</p>
          {description && (
            <p className="text-muted-foreground text-sm">{description}</p>
          )}
        </div>
        {onToggle && (
          <Switch checked={!!enabled} onCheckedChange={onToggle} />
        )}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: number | undefined
  onChange: (v: number | undefined) => void
  placeholder?: string
}) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min="0"
        step="0.5"
        className="w-40"
        placeholder={placeholder ?? "Not set"}
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? undefined : Number(e.target.value))
        }
      />
    </div>
  )
}

function PolicyForm({
  policy,
  leaveTypes,
  roleOpts,
  memberOpts,
  onSave,
  onDelete,
}: {
  policy: Policy
  leaveTypes: { _id: Id<"leaveTypes">; name: string }[]
  roleOpts: { value: string; label: string }[]
  memberOpts: { value: string; label: string }[]
  onSave: (patch: Record<string, unknown>) => void
  onDelete?: () => void
}) {
  const [f, setF] = React.useState<Form>(() => toForm(policy))
  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setF((prev) => ({ ...prev, [k]: v }))

  function save() {
    // Validate the approval chain before saving.
    for (const s of f.approvalChain) {
      if (s.approverType === "role" && !s.value) {
        toast.error("Pick a role for each role approver step.")
        return
      }
      if (s.approverType === "specific" && s.userIds.length === 0) {
        toast.error("Pick at least one person for each specific approver step.")
        return
      }
    }
    const approvalChain = f.approvalChain.map((s) => ({
      approverType: s.approverType,
      value: s.approverType === "specific" ? "" : s.value,
      userIds: s.approverType === "specific" ? s.userIds : undefined,
      thresholdEnabled: s.thresholdEnabled,
      daysMoreThan:
        s.thresholdEnabled && s.daysMoreThan !== ""
          ? Number(s.daysMoreThan)
          : undefined,
    }))
    onSave({
      name: f.name,
      description: f.description || undefined,
      availability: f.availability,
      approvalChain,
      entitlementMode: f.entitlementMode,
      entitlementDays: f.entitlementDays,
      toleranceDays: f.toleranceDays,
      earnedEnabled: f.earnedEnabled,
      accrualType: f.accrualType,
      proratedEnabled: f.proratedEnabled,
      prorateMode: f.prorateMode,
      carryForwardEnabled: f.carryForwardEnabled,
      maxCarryForwardDays: f.maxCarryForwardDays,
      seniorityEnabled: f.seniorityEnabled,
      seniorityEffective: f.seniorityEffective,
      seniorityIncrementMode: f.seniorityIncrementMode,
      seniorityRules: f.seniorityRules,
      seniorityMaxDays: f.seniorityMaxDays,
      rounding: f.rounding,
      linkedLeaveTypeId:
        f.linkedLeaveTypeId === "none"
          ? undefined
          : (f.linkedLeaveTypeId as Id<"leaveTypes">),
      useWorkingDays: f.useWorkingDays,
      allowApplyInPast: f.allowApplyInPast,
      minAdvanceDays: f.minAdvanceDays,
      maxAdvanceDays: f.maxAdvanceDays,
      maxConsecutiveDays: f.maxConsecutiveDays,
    })
  }

  return (
    <div className="rounded-lg border px-4">
      <Section title="Policy details">
        <div className="grid gap-3">
          <Input
            value={f.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Policy name"
          />
          <Textarea
            value={f.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Short description to briefly describe this policy"
          />
        </div>
      </Section>

      <Section
        title="Policy availability"
        description="Restricted policies apply only to assigned employees."
      >
        <Segmented
          value={f.availability}
          onChange={(v) => set("availability", v)}
          options={[
            { value: "all", label: "All employees" },
            { value: "groups", label: "Certain groups" },
          ]}
        />
      </Section>

      <Section
        title="Leave approval"
        description="Ordered approval chain. Each request walks the steps one at a time; any of a step's approvers can approve or reject it individually."
      >
        <LeaveApprovalChainEditor
          steps={f.approvalChain}
          onChange={(chain) => set("approvalChain", chain)}
          roleOpts={roleOpts}
          memberOpts={memberOpts}
        />
      </Section>

      <Section title="Entitlement">
        <div className="flex flex-col gap-3">
          <Segmented
            value={f.entitlementMode}
            onChange={(v) => set("entitlementMode", v)}
            options={[
              { value: "fixed", label: "Fixed entitlement" },
              { value: "upon_request", label: "Upon request" },
            ]}
          />
          {f.entitlementMode === "fixed" && (
            <div className="flex flex-wrap gap-4">
              <NumberField
                label="Entitlement amount (days)"
                value={f.entitlementDays}
                onChange={(v) => set("entitlementDays", v ?? 0)}
              />
              <NumberField
                label="Tolerance (allowed overdraw)"
                value={f.toleranceDays}
                onChange={(v) => set("toleranceDays", v)}
              />
            </div>
          )}
        </div>
      </Section>

      <Section
        title="Earned leave"
        description="Accrue this leave through the year instead of crediting it all up front."
        enabled={f.earnedEnabled}
        onToggle={(v) => set("earnedEnabled", v)}
      >
        {f.earnedEnabled && (
          <Segmented
            value={f.accrualType}
            onChange={(v) => set("accrualType", v)}
            options={[
              { value: "daily", label: "Daily basis" },
              { value: "monthly", label: "Monthly basis" },
            ]}
          />
        )}
      </Section>

      <Section
        title="Prorated leave"
        description="Prorate the entitlement for employees who join mid-year."
        enabled={f.proratedEnabled}
        onToggle={(v) => set("proratedEnabled", v)}
      >
        {f.proratedEnabled && (
          <Select
            value={f.prorateMode}
            onValueChange={(v) => set("prorateMode", v as Form["prorateMode"])}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="started">Started month</SelectItem>
              <SelectItem value="completed">Completed month</SelectItem>
              <SelectItem value="partial">Partial month</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Section>

      <Section
        title="Carry forward"
        description="Allow unused leave to carry over to the next year."
        enabled={f.carryForwardEnabled}
        onToggle={(v) => set("carryForwardEnabled", v)}
      >
        {f.carryForwardEnabled && (
          <NumberField
            label="Max carry-forward days"
            value={f.maxCarryForwardDays}
            onChange={(v) => set("maxCarryForwardDays", v)}
          />
        )}
      </Section>

      <Section
        title="Seniority"
        description="Grant extra entitlement based on years of service."
        enabled={f.seniorityEnabled}
        onToggle={(v) => set("seniorityEnabled", v)}
      >
        {f.seniorityEnabled && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-4">
              <div className="grid gap-1.5">
                <Label className="text-xs">Effective date</Label>
                <Segmented
                  value={f.seniorityEffective}
                  onChange={(v) => set("seniorityEffective", v)}
                  options={[
                    { value: "period", label: "Beginning of period" },
                    { value: "anniversary", label: "Anniversary" },
                  ]}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Increment mode</Label>
                <Segmented
                  value={f.seniorityIncrementMode}
                  onChange={(v) => set("seniorityIncrementMode", v)}
                  options={[
                    { value: "fixed", label: "Fixed" },
                    { value: "variable", label: "Variable" },
                  ]}
                />
              </div>
            </div>

            {f.seniorityIncrementMode === "fixed" ? (
              <div className="text-sm">
                Add{" "}
                <input
                  type="number"
                  min="0"
                  className="border-input mx-1 w-16 rounded-md border px-2 py-1"
                  value={f.seniorityRules[0]?.addDays ?? 1}
                  onChange={(e) =>
                    set("seniorityRules", [
                      {
                        afterYears: f.seniorityRules[0]?.afterYears ?? 1,
                        addDays: Number(e.target.value),
                      },
                    ])
                  }
                />
                day(s) every{" "}
                <input
                  type="number"
                  min="1"
                  className="border-input mx-1 w-16 rounded-md border px-2 py-1"
                  value={f.seniorityRules[0]?.afterYears ?? 1}
                  onChange={(e) =>
                    set("seniorityRules", [
                      {
                        afterYears: Number(e.target.value),
                        addDays: f.seniorityRules[0]?.addDays ?? 1,
                      },
                    ])
                  }
                />
                year(s) of service.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {f.seniorityRules.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    After
                    <input
                      type="number"
                      min="0"
                      className="border-input w-16 rounded-md border px-2 py-1"
                      value={r.afterYears}
                      onChange={(e) => {
                        const next = [...f.seniorityRules]
                        next[i] = { ...r, afterYears: Number(e.target.value) }
                        set("seniorityRules", next)
                      }}
                    />
                    year(s), add
                    <input
                      type="number"
                      min="0"
                      className="border-input w-16 rounded-md border px-2 py-1"
                      value={r.addDays}
                      onChange={(e) => {
                        const next = [...f.seniorityRules]
                        next[i] = { ...r, addDays: Number(e.target.value) }
                        set("seniorityRules", next)
                      }}
                    />
                    day(s)
                    <button
                      onClick={() =>
                        set(
                          "seniorityRules",
                          f.seniorityRules.filter((_, j) => j !== i),
                        )
                      }
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <IconTrash className="size-4" />
                    </button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() =>
                    set("seniorityRules", [
                      ...f.seniorityRules,
                      { afterYears: 1, addDays: 1 },
                    ])
                  }
                >
                  <IconPlus className="size-4" /> Add tier
                </Button>
              </div>
            )}
            <NumberField
              label="Maximum extra days (cap)"
              value={f.seniorityMaxDays}
              onChange={(v) => set("seniorityMaxDays", v)}
            />
          </div>
        )}
      </Section>

      <Section title="Rounding" description="Round the computed entitlement.">
        <Select
          value={f.rounding}
          onValueChange={(v) => set("rounding", v as Form["rounding"])}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="up">Round up</SelectItem>
            <SelectItem value="down">Round down</SelectItem>
            <SelectItem value="nearest_half">Nearest half day</SelectItem>
          </SelectContent>
        </Select>
      </Section>

      <Section
        title="Link to another leave type"
        description="Leave booked here is deducted from the linked type's balance."
      >
        <Select
          value={f.linkedLeaveTypeId}
          onValueChange={(v) => set("linkedLeaveTypeId", v)}
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {leaveTypes.map((t) => (
              <SelectItem key={t._id} value={t._id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Section>

      <Section title="Advance settings">
        <div className="flex flex-col gap-4">
          <label className="flex items-center justify-between text-sm">
            <span>
              Use working days
              <span className="text-muted-foreground block text-xs">
                Exclude weekends &amp; holidays from the day count.
              </span>
            </span>
            <Switch
              checked={f.useWorkingDays}
              onCheckedChange={(v) => set("useWorkingDays", v)}
            />
          </label>
          <label className="flex items-center justify-between text-sm">
            <span>
              Allow applying for past dates
              <span className="text-muted-foreground block text-xs">
                Useful for sick / medical leave.
              </span>
            </span>
            <Switch
              checked={f.allowApplyInPast}
              onCheckedChange={(v) => set("allowApplyInPast", v)}
            />
          </label>
          <div className="flex flex-wrap gap-4">
            <NumberField
              label="Min advance notice (days)"
              value={f.minAdvanceDays}
              onChange={(v) => set("minAdvanceDays", v)}
            />
            <NumberField
              label="Max advance booking (days)"
              value={f.maxAdvanceDays}
              onChange={(v) => set("maxAdvanceDays", v)}
            />
            <NumberField
              label="Max consecutive days"
              value={f.maxConsecutiveDays}
              onChange={(v) => set("maxConsecutiveDays", v)}
            />
          </div>
        </div>
      </Section>

      <div className="flex items-center justify-between py-4">
        {onDelete ? (
          <Button variant="ghost" className="text-destructive" onClick={onDelete}>
            <IconTrash className="size-4" /> Delete policy
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={save}>Save policy</Button>
      </div>
    </div>
  )
}
