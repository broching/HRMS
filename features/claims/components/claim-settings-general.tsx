"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import {
  IconTrash,
  IconChevronDown,
  IconGripVertical,
} from "@tabler/icons-react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  restrictToVerticalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { getErrorMessage } from "@/lib/errors"
import { useHasPermission } from "@/hooks/use-permission"
import { dollarsToCents, centsToInput } from "@/features/payroll/lib/labels"

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

// Reserved ids for the built-in assignee groups (mirror convex/lib/enums.ts).
const GROUP_HR = "hr"
const GROUP_FINANCE = "finance"

type RuleForm = { amount: string; officeIds: Id<"offices">[] }
type StepForm = {
  key: string // stable id for drag-and-drop + React keys
  approverType: "position" | "specific" | "group"
  value: string
  thresholdEnabled: boolean
  rules: RuleForm[]
}
type GroupForm = { id: string; name: string; userIds: Id<"users">[] }
type FormState = {
  cutoffDay: number
  validityMonths: number | null
  hrApproverUserIds: Id<"users">[]
  financeApproverUserIds: Id<"users">[]
  assigneeGroups: GroupForm[]
  workflow: StepForm[]
  payrollMode: "manual" | "automatic"
  payrollItem: string
}

// A locally-unique id for new steps/groups.
function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
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

// Sortable wrapper for one approval-workflow step. Provides a drag handle
// (rendered via the render-prop) wired to dnd-kit's sortable listeners.
function SortableStep({
  id,
  children,
}: {
  id: string
  children: (handle: React.ReactNode) => React.ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
    zIndex: isDragging ? 10 : undefined,
    position: "relative",
  }
  const handle = (
    <button
      type="button"
      className="text-muted-foreground/50 hover:text-foreground -ml-1 cursor-grab touch-none active:cursor-grabbing"
      aria-label="Drag to reorder"
      {...attributes}
      {...listeners}
    >
      <IconGripVertical className="size-4" />
    </button>
  )
  return (
    <div ref={setNodeRef} style={style}>
      {children(handle)}
    </div>
  )
}

// One flagged assignee in the HR/Finance guardrail: someone added as an
// approver who can't actually act on claims yet.
type GuardUser = {
  userId: Id<"users">
  memberId: Id<"members">
  name: string
  roleName: string
  isCustomRole: boolean
}

export function ClaimSettingsGeneral() {
  const data = useQuery(api.claimSettings.get)
  const options = useQuery(api.claimSettings.options)
  const save = useMutation(api.claimSettings.save)
  const assignPreset = useMutation(api.roles.assignPreset)
  const canManageMembers = useHasPermission("members:manage")
  const router = useRouter()
  const [form, setForm] = React.useState<FormState | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  // Guardrail dialog: flagged approvers for the HR or Finance group.
  const [guard, setGuard] = React.useState<{
    group: "HR" | "Finance"
    presetKey: "hr" | "finance"
    users: GuardUser[]
  } | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  React.useEffect(() => {
    if (data && form === null) {
      setForm({
        cutoffDay: data.cutoffDay,
        validityMonths: data.transactionValidityMonths,
        hrApproverUserIds: data.hrApproverUserIds,
        financeApproverUserIds: data.financeApproverUserIds,
        assigneeGroups: data.assigneeGroups.map((g) => ({
          id: g.id,
          name: g.name,
          userIds: g.userIds,
        })),
        workflow: data.approvalWorkflow.map((s) => ({
          key: newId(),
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
  const memberById = new Map(options.members.map((m) => [m.userId as string, m]))

  function patch(p: Partial<FormState>) {
    setForm((f) => (f ? { ...f, ...p } : f))
  }

  // Commit an approver id into the HR/Finance list (deduped).
  function addApprover(group: "HR" | "Finance", userId: Id<"users">) {
    if (group === "HR") {
      setForm((f) =>
        f && !f.hrApproverUserIds.includes(userId)
          ? { ...f, hrApproverUserIds: [...f.hrApproverUserIds, userId] }
          : f,
      )
    } else {
      setForm((f) =>
        f && !f.financeApproverUserIds.includes(userId)
          ? { ...f, financeApproverUserIds: [...f.financeApproverUserIds, userId] }
          : f,
      )
    }
  }

  // Update an HR/Finance approver list. Someone can only be *added* once they
  // can actually act on claims — anyone newly picked who lacks access is held
  // back (not committed) and surfaced in the guardrail so the admin grants them
  // access first. Removals always go through.
  function handleAssigneeChange(group: "HR" | "Finance", next: string[]) {
    const field =
      group === "HR" ? "hrApproverUserIds" : "financeApproverUserIds"
    const prev = (form?.[field] ?? []) as string[]

    const flagged: GuardUser[] = next
      .filter((u) => !prev.includes(u))
      .map((u) => memberById.get(u))
      .filter((m): m is NonNullable<typeof m> => !!m && !m.hasFinanceAccess)
      .map((m) => ({
        userId: m.userId,
        memberId: m.memberId,
        name: m.name,
        roleName: m.roleName,
        isCustomRole: m.isCustomRole,
      }))

    // Drop the flagged additions; keep allowed additions and honour removals.
    const flaggedIds = new Set(flagged.map((f) => f.userId as string))
    const committed = next.filter((u) => !flaggedIds.has(u)) as Id<"users">[]
    if (group === "HR") patch({ hrApproverUserIds: committed })
    else patch({ financeApproverUserIds: committed })

    if (flagged.length > 0) {
      setGuard({
        group,
        presetKey: group === "HR" ? "hr" : "finance",
        users: flagged,
      })
    }
  }

  async function grantPreset(u: GuardUser) {
    if (!guard) return
    const group = guard.group
    try {
      await assignPreset({ memberId: u.memberId, key: guard.presetKey })
      // Now that they can act on claims, add them to the approver list.
      addApprover(group, u.userId)
      toast.success(`${u.name} is now ${group}`)
      setGuard((g) => {
        if (!g) return g
        const remaining = g.users.filter((x) => x.userId !== u.userId)
        return remaining.length ? { ...g, users: remaining } : null
      })
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't assign role"))
    }
  }
  function patchStep(i: number, p: Partial<StepForm>) {
    setForm((f) =>
      f
        ? { ...f, workflow: f.workflow.map((s, j) => (j === i ? { ...s, ...p } : s)) }
        : f,
    )
  }
  function patchGroup(i: number, p: Partial<GroupForm>) {
    setForm((f) =>
      f
        ? {
            ...f,
            assigneeGroups: f.assigneeGroups.map((g, j) =>
              j === i ? { ...g, ...p } : g,
            ),
          }
        : f,
    )
  }

  // Selectable approver groups for workflow steps: the two built-ins plus any
  // custom groups the admin has defined.
  const groupOpts = [
    { value: GROUP_HR, label: "HR" },
    { value: GROUP_FINANCE, label: "Finance" },
    ...form.assigneeGroups.map((g) => ({
      value: g.id,
      label: g.name.trim() || "Untitled group",
    })),
  ]

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    setForm((f) => {
      if (!f) return f
      const from = f.workflow.findIndex((s) => s.key === active.id)
      const to = f.workflow.findIndex((s) => s.key === over.id)
      if (from < 0 || to < 0) return f
      return { ...f, workflow: arrayMove(f.workflow, from, to) }
    })
  }

  // Validate, then confirm — approval-chain changes only affect future claims.
  function onSave() {
    if (!form) return
    if (form.assigneeGroups.some((g) => !g.name.trim())) {
      toast.error("Every assignee group needs a name.")
      return
    }
    if (form.workflow.some((s) => s.approverType === "group" && !s.value)) {
      toast.error("Pick a group for each group approver step.")
      return
    }
    if (form.workflow.some((s) => s.approverType === "specific" && !s.value)) {
      toast.error("Pick a person for each specific approver step.")
      return
    }
    setConfirmOpen(true)
  }

  async function doSave() {
    if (!form) return
    setBusy(true)
    try {
      await save({
        cutoffDay: form.cutoffDay,
        transactionValidityMonths: form.validityMonths,
        hrApproverUserIds: form.hrApproverUserIds,
        financeApproverUserIds: form.financeApproverUserIds,
        assigneeGroups: form.assigneeGroups.map((g) => ({
          id: g.id,
          name: g.name.trim(),
          userIds: g.userIds,
        })),
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
      setConfirmOpen(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save settings"))
    } finally {
      setBusy(false)
    }
  }

  const positionLabel = (s: StepForm) =>
    s.approverType === "position"
      ? "Position"
      : s.approverType === "group"
        ? "Assignee group"
        : "Specific person"

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
          description="People responsible for approving claims. HR and Finance automatically review each claim after the approval workflow below — HR first, then Finance. Custom groups only apply when added as a workflow step."
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>HR</Label>
              <MultiSelect
                options={memberOpts}
                selected={form.hrApproverUserIds as string[]}
                onChange={(v) => handleAssigneeChange("HR", v)}
                placeholder="Choose"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Finance</Label>
              <MultiSelect
                options={memberOpts}
                selected={form.financeApproverUserIds as string[]}
                onChange={(v) => handleAssigneeChange("Finance", v)}
                placeholder="Choose"
              />
            </div>

            {form.assigneeGroups.length > 0 && (
              <>
                <Separator className="my-1" />
                {form.assigneeGroups.map((g, gi) => (
                  <div
                    key={g.id}
                    className="bg-muted/30 flex flex-col gap-2 rounded-md border p-3"
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        className="h-8 max-w-xs font-medium"
                        placeholder="Group name (e.g. Fraud checker)"
                        value={g.name}
                        onChange={(e) =>
                          patchGroup(gi, { name: e.target.value })
                        }
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="text-destructive size-8"
                        onClick={() =>
                          patch({
                            assigneeGroups: form.assigneeGroups.filter(
                              (_, j) => j !== gi,
                            ),
                          })
                        }
                      >
                        <IconTrash className="size-4" />
                      </Button>
                    </div>
                    <MultiSelect
                      options={memberOpts}
                      selected={g.userIds as string[]}
                      onChange={(v) =>
                        patchGroup(gi, { userIds: v as Id<"users">[] })
                      }
                      placeholder="Choose members"
                    />
                  </div>
                ))}
              </>
            )}

            <button
              type="button"
              className="text-primary w-fit text-sm font-medium"
              onClick={() =>
                patch({
                  assigneeGroups: [
                    ...form.assigneeGroups,
                    { id: newId(), name: "", userIds: [] },
                  ],
                })
              }
            >
              + Add group
            </button>
          </div>
        </Section>

        {/* Approval workflow */}
        <Section
          title="Approval workflow"
          description="Set the approval chain for employees' claim reports. Drag to reorder. Higher tiers can apply only above a threshold."
        >
          <div className="flex flex-col gap-5">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis, restrictToParentElement]}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={form.workflow.map((s) => s.key)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col gap-5">
                  {form.workflow.map((step, i) => (
                    <SortableStep key={step.key} id={step.key}>
                      {(handle) => (
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {handle}
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
                                  approverType: v as StepForm["approverType"],
                                  value:
                                    v === "position"
                                      ? "manager"
                                      : v === "group"
                                        ? GROUP_HR
                                        : "",
                                })
                              }
                            >
                              <SelectTrigger className="w-40">
                                <SelectValue>{positionLabel(step)}</SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="position">Position</SelectItem>
                                <SelectItem value="group">
                                  Assignee group
                                </SelectItem>
                                <SelectItem value="specific">
                                  Specific person
                                </SelectItem>
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
                            ) : step.approverType === "group" ? (
                              <Select
                                value={step.value}
                                onValueChange={(v) => patchStep(i, { value: v })}
                              >
                                <SelectTrigger className="w-44">
                                  <SelectValue placeholder="Choose group" />
                                </SelectTrigger>
                                <SelectContent>
                                  {groupOpts.map((g) => (
                                    <SelectItem key={g.value} value={g.value}>
                                      {g.label}
                                    </SelectItem>
                                  ))}
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
                            {form.workflow.length > 1 && (
                              <Button
                                variant="outline"
                                size="icon"
                                className="size-8 text-destructive"
                                onClick={() =>
                                  patch({
                                    workflow: form.workflow.filter(
                                      (_, j) => j !== i,
                                    ),
                                  })
                                }
                              >
                                <IconTrash className="size-4" />
                              </Button>
                            )}
                          </div>

                          <label className="ml-28 flex w-fit items-center gap-2 text-sm">
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
                            <div className="border-primary/40 ml-28 flex flex-col gap-3 border-l-2 bg-muted/40 p-3 text-sm">
                              <p className="text-muted-foreground">
                                This approver applies only once a claim exceeds the
                                threshold below.
                              </p>
                              {step.rules.map((rule, ri) => (
                                <div
                                  key={ri}
                                  className="flex flex-wrap items-end gap-3"
                                >
                                  <div className="flex flex-col gap-1">
                                    <Label className="text-xs">
                                      Amount is more than
                                    </Label>
                                    <Input
                                      className="w-40"
                                      inputMode="decimal"
                                      placeholder="e.g. 400"
                                      value={rule.amount}
                                      onChange={(e) =>
                                        patchStep(i, {
                                          rules: step.rules.map((r, j) =>
                                            j === ri
                                              ? { ...r, amount: e.target.value }
                                              : r,
                                          ),
                                        })
                                      }
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <Label className="text-xs">
                                      Offices (empty = all)
                                    </Label>
                                    <div className="w-56">
                                      <MultiSelect
                                        options={officeOpts}
                                        selected={rule.officeIds as string[]}
                                        onChange={(v) =>
                                          patchStep(i, {
                                            rules: step.rules.map((r, j) =>
                                              j === ri
                                                ? {
                                                    ...r,
                                                    officeIds:
                                                      v as Id<"offices">[],
                                                  }
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
                                      variant="outline"
                                      size="icon"
                                      className="size-8 text-destructive"
                                      onClick={() =>
                                        patchStep(i, {
                                          rules: step.rules.filter(
                                            (_, j) => j !== ri,
                                          ),
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
                                    rules: [
                                      ...step.rules,
                                      { amount: "", officeIds: [] },
                                    ],
                                  })
                                }
                              >
                                + Add rule
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </SortableStep>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            <button
              type="button"
              className="text-primary w-fit text-sm font-medium"
              onClick={() =>
                patch({
                  workflow: [
                    ...form.workflow,
                    {
                      key: newId(),
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

      <Dialog open={confirmOpen} onOpenChange={(o) => !busy && setConfirmOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save claim settings?</DialogTitle>
            <DialogDescription>
              These changes apply <strong>only to claims created after saving</strong>.
              Claims already submitted keep the approval chain they were created
              with, so in-flight approvals aren&apos;t disrupted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={doSave} disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* HR/Finance assignee guardrail */}
      <Dialog open={!!guard} onOpenChange={(o) => !o && setGuard(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Grant {guard?.group} claim access?</DialogTitle>
            <DialogDescription>
              {guard?.users.length === 1 ? "This person" : "These people"} can&apos;t
              act on claims yet, so they haven&apos;t been added to the{" "}
              {guard?.group} approvers. Grant access below to add them.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {guard?.users.map((u) => (
              <div
                key={u.userId}
                className="flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{u.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {u.isCustomRole
                      ? `Custom role “${u.roleName}” — missing claim approval`
                      : `Current role: ${u.roleName}`}
                  </p>
                </div>
                {u.isCustomRole ? (
                  <Button
                    variant="outline"
                    className="shrink-0"
                    onClick={() => {
                      setGuard(null)
                      router.push("/settings/org-structure")
                    }}
                  >
                    Edit role
                  </Button>
                ) : canManageMembers ? (
                  <Button
                    className="shrink-0"
                    onClick={() => grantPreset(u)}
                  >
                    Assign {guard?.group}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="shrink-0"
                    onClick={() => {
                      setGuard(null)
                      router.push("/settings/members")
                    }}
                  >
                    Manage in Members
                  </Button>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGuard(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
