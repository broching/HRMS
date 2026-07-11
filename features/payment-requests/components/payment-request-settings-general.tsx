"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import {
  IconTrash,
  IconChevronDown,
  IconChevronRight,
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
import { dollarsToCents, centsToInput } from "@/features/payroll/lib/labels"

const GROUP_HR = "hr"
const GROUP_FINANCE = "finance"

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

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
        <Button variant="outline" className="h-auto min-h-9 w-full justify-between font-normal">
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
          <div className="text-muted-foreground px-2 py-1.5 text-sm">None available</div>
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

type RuleForm = { amount: string; officeIds: Id<"offices">[] }
type StepForm = {
  key: string
  approverType: "position" | "specific" | "group"
  value: string
  thresholdEnabled: boolean
  rules: RuleForm[]
  requiresSignature: boolean
}
type GroupForm = { id: string; name: string; userIds: Id<"users">[] }
type FlowForm = {
  key: string
  id: string
  name: string
  matchType: "default" | "role" | "person"
  roleId?: Id<"roles">
  userIds: Id<"users">[]
  workflow: StepForm[]
}
type FormState = {
  hrApproverUserIds: Id<"users">[]
  financeApproverUserIds: Id<"users">[]
  financeRequiresSignature: boolean
  assigneeGroups: GroupForm[]
  flows: FlowForm[]
  defaultTemplateId: Id<"paymentRequestTemplates"> | null
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

function SortableStep({
  id,
  children,
}: {
  id: string
  children: (handle: React.ReactNode) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id })
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

function WorkflowEditor({
  steps,
  onChange,
  groupOpts,
  memberOpts,
  officeOpts,
}: {
  steps: StepForm[]
  onChange: (next: StepForm[]) => void
  groupOpts: { value: string; label: string }[]
  memberOpts: { value: string; label: string }[]
  officeOpts: { value: string; label: string }[]
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  function patchStep(i: number, p: Partial<StepForm>) {
    onChange(steps.map((s, j) => (j === i ? { ...s, ...p } : s)))
  }
  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = steps.findIndex((s) => s.key === active.id)
    const to = steps.findIndex((s) => s.key === over.id)
    if (from < 0 || to < 0) return
    onChange(arrayMove(steps, from, to))
  }
  const positionLabel = (s: StepForm) =>
    s.approverType === "position"
      ? "Position"
      : s.approverType === "group"
        ? "Assignee group"
        : "Specific person"

  return (
    <div className="flex flex-col gap-5">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={steps.map((s) => s.key)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-5">
            {steps.map((step, i) => (
              <SortableStep key={step.key} id={step.key}>
                {(handle) => (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {handle}
                      <span className="text-muted-foreground w-20 text-sm">
                        {i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "3rd" : `${i + 1}th`}{" "}
                        Approver
                      </span>
                      <Select
                        value={step.approverType}
                        onValueChange={(v) =>
                          patchStep(i, {
                            approverType: v as StepForm["approverType"],
                            value:
                              v === "position" ? "manager" : v === "group" ? GROUP_HR : "",
                          })
                        }
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue>{positionLabel(step)}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="position">Position</SelectItem>
                          <SelectItem value="group">Assignee group</SelectItem>
                          <SelectItem value="specific">Specific person</SelectItem>
                        </SelectContent>
                      </Select>
                      {step.approverType === "position" ? (
                        <Select value={step.value || "manager"} onValueChange={(v) => patchStep(i, { value: v })}>
                          <SelectTrigger className="w-44">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="department_head">Department head</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : step.approverType === "group" ? (
                        <Select value={step.value} onValueChange={(v) => patchStep(i, { value: v })}>
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
                        <Select value={step.value} onValueChange={(v) => patchStep(i, { value: v })}>
                          <SelectTrigger className="w-44">
                            <SelectValue placeholder="Choose person" />
                          </SelectTrigger>
                          <SelectContent>
                            {memberOpts.map((m) => (
                              <SelectItem key={m.value} value={m.value}>
                                {m.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {steps.length > 1 && (
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-8 text-destructive"
                          onClick={() => onChange(steps.filter((_, j) => j !== i))}
                        >
                          <IconTrash className="size-4" />
                        </Button>
                      )}
                    </div>

                    <div className="ml-28 flex flex-wrap items-center gap-x-5 gap-y-2">
                      <label className="flex w-fit items-center gap-2 text-sm">
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
                      <label className="flex w-fit items-center gap-2 text-sm">
                        <Checkbox
                          checked={step.requiresSignature}
                          onCheckedChange={(c) => patchStep(i, { requiresSignature: c === true })}
                        />
                        Require signature
                      </label>
                    </div>

                    {step.thresholdEnabled && (
                      <div className="border-primary/40 ml-28 flex flex-col gap-3 border-l-2 bg-muted/40 p-3 text-sm">
                        <p className="text-muted-foreground">
                          This approver applies only once a request exceeds the threshold below.
                        </p>
                        {step.rules.map((rule, ri) => (
                          <div key={ri} className="flex flex-wrap items-end gap-3">
                            <div className="flex flex-col gap-1">
                              <Label className="text-xs">Amount is more than</Label>
                              <Input
                                className="w-40"
                                inputMode="decimal"
                                placeholder="e.g. 5000"
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
                                        j === ri ? { ...r, officeIds: v as Id<"offices">[] } : r,
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
                                  patchStep(i, { rules: step.rules.filter((_, j) => j !== ri) })
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
                            patchStep(i, { rules: [...step.rules, { amount: "", officeIds: [] }] })
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
          onChange([
            ...steps,
            {
              key: newId(),
              approverType: "position",
              value: "manager",
              thresholdEnabled: false,
              rules: [],
              requiresSignature: false,
            },
          ])
        }
      >
        + Add approver
      </button>
    </div>
  )
}

export function PaymentRequestSettingsGeneral() {
  const data = useQuery(api.paymentRequestSettings.get)
  const options = useQuery(api.paymentRequestSettings.options)
  const templates = useQuery(api.paymentRequestTemplates.list, {})
  const save = useMutation(api.paymentRequestSettings.save)
  const [form, setForm] = React.useState<FormState | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [expandedFlows, setExpandedFlows] = React.useState<Set<string>>(new Set())

  function toggleFlow(key: string) {
    setExpandedFlows((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  React.useEffect(() => {
    if (data && form === null) {
      setForm({
        hrApproverUserIds: data.hrApproverUserIds,
        financeApproverUserIds: data.financeApproverUserIds,
        financeRequiresSignature: data.financeRequiresSignature,
        assigneeGroups: data.assigneeGroups.map((g) => ({
          id: g.id,
          name: g.name,
          userIds: g.userIds,
        })),
        flows: [...data.approvalFlows]
          .sort(
            (a, b) =>
              (a.match.type === "default" ? -1 : 1) - (b.match.type === "default" ? -1 : 1),
          )
          .map((f) => ({
            key: newId(),
            id: f.id,
            name: f.name,
            matchType: f.match.type,
            roleId: f.match.roleId,
            userIds: f.match.userIds ?? (f.match.userId ? [f.match.userId] : []),
            workflow: f.workflow.map((s) => ({
              key: newId(),
              approverType: s.approverType,
              value: s.value,
              thresholdEnabled: s.thresholdEnabled,
              rules: s.rules.map((r) => ({
                amount: centsToInput(r.amountMoreThanCents),
                officeIds: r.officeIds,
              })),
              requiresSignature: s.requiresSignature ?? false,
            })),
          })),
        defaultTemplateId: data.defaultTemplateId,
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

  const memberOpts = options.members.map((m) => ({ value: m.userId as string, label: m.name }))
  const officeOpts = options.offices.map((o) => ({ value: o._id as string, label: o.name }))
  const roleOpts = options.roles.map((r) => ({ value: r._id as string, label: r.name }))
  const groupOpts = [
    { value: GROUP_HR, label: "HR" },
    { value: GROUP_FINANCE, label: "Finance" },
    ...form.assigneeGroups.map((g) => ({
      value: g.id,
      label: g.name.trim() || "Untitled group",
    })),
  ]

  function patch(p: Partial<FormState>) {
    setForm((f) => (f ? { ...f, ...p } : f))
  }
  function patchGroup(i: number, p: Partial<GroupForm>) {
    setForm((f) =>
      f
        ? { ...f, assigneeGroups: f.assigneeGroups.map((g, j) => (j === i ? { ...g, ...p } : g)) }
        : f,
    )
  }
  function patchFlow(i: number, p: Partial<FlowForm>) {
    setForm((f) => (f ? { ...f, flows: f.flows.map((fl, j) => (j === i ? { ...fl, ...p } : fl)) } : f))
  }

  function onSave() {
    if (!form) return
    if (form.assigneeGroups.some((g) => !g.name.trim())) {
      toast.error("Every assignee group needs a name.")
      return
    }
    for (const flow of form.flows) {
      if (flow.matchType !== "default" && !flow.name.trim()) {
        toast.error("Every flow needs a name.")
        return
      }
      if (flow.matchType === "role" && !flow.roleId) {
        toast.error("Pick a role for each role flow.")
        return
      }
      if (flow.matchType === "person" && flow.userIds.length === 0) {
        toast.error("Pick at least one person for each specific-person flow.")
        return
      }
      if (flow.workflow.some((s) => s.approverType !== "position" && !s.value)) {
        toast.error("Pick a target for every approver step.")
        return
      }
    }
    setConfirmOpen(true)
  }

  async function doSave() {
    if (!form) return
    setBusy(true)
    try {
      await save({
        hrApproverUserIds: form.hrApproverUserIds,
        financeApproverUserIds: form.financeApproverUserIds,
        financeRequiresSignature: form.financeRequiresSignature,
        assigneeGroups: form.assigneeGroups.map((g) => ({
          id: g.id,
          name: g.name.trim(),
          userIds: g.userIds,
        })),
        approvalFlows: form.flows.map((flow) => ({
          id: flow.id,
          name: flow.matchType === "default" ? "Default" : flow.name.trim(),
          match:
            flow.matchType === "default"
              ? { type: "default" as const }
              : flow.matchType === "role"
                ? { type: "role" as const, roleId: flow.roleId }
                : { type: "person" as const, userIds: flow.userIds },
          workflow: flow.workflow.map((s) => ({
            approverType: s.approverType,
            value: s.value,
            thresholdEnabled: s.thresholdEnabled,
            rules: s.rules.map((r) => ({
              amountMoreThanCents: dollarsToCents(r.amount) ?? 0,
              officeIds: r.officeIds,
            })),
            requiresSignature: s.requiresSignature,
          })),
        })),
        defaultTemplateId: form.defaultTemplateId,
      })
      toast.success("Payment request settings saved")
      setConfirmOpen(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save settings"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-4 lg:px-6">
      <div className="divide-y rounded-lg border px-5">
        {/* Assignees */}
        <Section
          title="Approval assignees"
          description="People who review payment requests. HR and Finance automatically review each request after the approval workflow below — HR first, then Finance. Custom groups only apply when added as a workflow step."
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>HR</Label>
              <MultiSelect
                options={memberOpts}
                selected={form.hrApproverUserIds as string[]}
                onChange={(v) => patch({ hrApproverUserIds: v as Id<"users">[] })}
                placeholder="Choose"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Finance</Label>
              <MultiSelect
                options={memberOpts}
                selected={form.financeApproverUserIds as string[]}
                onChange={(v) => patch({ financeApproverUserIds: v as Id<"users">[] })}
                placeholder="Choose"
              />
              <label className="mt-1 flex w-fit items-center gap-2 text-sm">
                <Checkbox
                  checked={form.financeRequiresSignature}
                  onCheckedChange={(c) => patch({ financeRequiresSignature: c === true })}
                />
                Require signature at the Finance stage
              </label>
            </div>

            {form.assigneeGroups.length > 0 && (
              <>
                <Separator className="my-1" />
                {form.assigneeGroups.map((g, gi) => (
                  <div key={g.id} className="bg-muted/30 flex flex-col gap-2 rounded-md border p-3">
                    <div className="flex items-center gap-2">
                      <Input
                        className="h-8 max-w-xs font-medium"
                        placeholder="Group name (e.g. Director)"
                        value={g.name}
                        onChange={(e) => patchGroup(gi, { name: e.target.value })}
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="text-destructive size-8"
                        onClick={() =>
                          patch({ assigneeGroups: form.assigneeGroups.filter((_, j) => j !== gi) })
                        }
                      >
                        <IconTrash className="size-4" />
                      </Button>
                    </div>
                    <MultiSelect
                      options={memberOpts}
                      selected={g.userIds as string[]}
                      onChange={(v) => patchGroup(gi, { userIds: v as Id<"users">[] })}
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
                  assigneeGroups: [...form.assigneeGroups, { id: newId(), name: "", userIds: [] }],
                })
              }
            >
              + Add group
            </button>
          </div>
        </Section>

        {/* Approval flows */}
        <Section
          title="Approval flows"
          description="Set approval chains for payment requests. The Default flow applies to everyone; add flows to give a specific role or person their own chain. Drag steps to reorder; higher tiers can apply only above a threshold."
        >
          <div className="flex flex-col gap-4">
            {form.flows.map((flow, fi) => (
              <div key={flow.key} className="flex flex-col gap-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleFlow(flow.key)}
                    aria-label={expandedFlows.has(flow.key) ? "Collapse flow" : "Expand flow"}
                    className="text-muted-foreground hover:text-foreground -ml-1 shrink-0"
                  >
                    {expandedFlows.has(flow.key) ? (
                      <IconChevronDown className="size-4" />
                    ) : (
                      <IconChevronRight className="size-4" />
                    )}
                  </button>
                  {flow.matchType === "default" ? (
                    <>
                      <span className="font-medium">Default</span>
                      <Badge variant="secondary">Everyone else</Badge>
                    </>
                  ) : (
                    <>
                      <Input
                        className="h-8 max-w-[200px] font-medium"
                        placeholder="Flow name (e.g. Directors)"
                        value={flow.name}
                        onChange={(e) => patchFlow(fi, { name: e.target.value })}
                      />
                      <span className="text-muted-foreground text-sm">applies to</span>
                      <Select
                        value={flow.matchType}
                        onValueChange={(v) =>
                          patchFlow(fi, {
                            matchType: v as FlowForm["matchType"],
                            roleId: undefined,
                            userIds: [],
                          })
                        }
                      >
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="role">Role</SelectItem>
                          <SelectItem value="person">Specific person(s)</SelectItem>
                        </SelectContent>
                      </Select>
                      {flow.matchType === "role" ? (
                        <Select
                          value={(flow.roleId as string) ?? ""}
                          onValueChange={(v) => patchFlow(fi, { roleId: v as Id<"roles"> })}
                        >
                          <SelectTrigger className="w-44">
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
                        <div className="w-56">
                          <MultiSelect
                            options={memberOpts}
                            selected={flow.userIds as string[]}
                            onChange={(v) => patchFlow(fi, { userIds: v as Id<"users">[] })}
                            placeholder="Choose person(s)"
                          />
                        </div>
                      )}
                      <Button
                        variant="outline"
                        size="icon"
                        className="ml-auto size-8 text-destructive"
                        onClick={() => patch({ flows: form.flows.filter((_, j) => j !== fi) })}
                      >
                        <IconTrash className="size-4" />
                      </Button>
                    </>
                  )}
                  {!expandedFlows.has(flow.key) && (
                    <button
                      type="button"
                      onClick={() => toggleFlow(flow.key)}
                      className={cn(
                        "text-muted-foreground text-xs",
                        flow.matchType === "default" && "ml-auto",
                      )}
                    >
                      {flow.workflow.length} approver{flow.workflow.length === 1 ? "" : "s"}
                    </button>
                  )}
                </div>
                {expandedFlows.has(flow.key) && (
                  <>
                    <Separator />
                    <WorkflowEditor
                      steps={flow.workflow}
                      onChange={(w) => patchFlow(fi, { workflow: w })}
                      groupOpts={groupOpts}
                      memberOpts={memberOpts}
                      officeOpts={officeOpts}
                    />
                  </>
                )}
              </div>
            ))}
            <button
              type="button"
              className="text-primary w-fit text-sm font-medium"
              onClick={() => {
                const key = newId()
                patch({
                  flows: [
                    ...form.flows,
                    {
                      key,
                      id: newId(),
                      name: "",
                      matchType: "role",
                      roleId: undefined,
                      userIds: [],
                      workflow: [
                        {
                          key: newId(),
                          approverType: "position",
                          value: "manager",
                          thresholdEnabled: false,
                          rules: [],
                          requiresSignature: false,
                        },
                      ],
                    },
                  ],
                })
                setExpandedFlows((s) => new Set(s).add(key))
              }}
            >
              + Add flow
            </button>
          </div>
        </Section>

        {/* Default template */}
        <Section
          title="Default form template"
          description="The template applied by default when someone raises a payment request. Manage templates in the Templates tab."
        >
          <Select
            value={form.defaultTemplateId ?? "none"}
            onValueChange={(v) =>
              patch({
                defaultTemplateId: v === "none" ? null : (v as Id<"paymentRequestTemplates">),
              })
            }
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder="No default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No default</SelectItem>
              {(templates ?? []).map((t) => (
                <SelectItem key={t._id} value={t._id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            <DialogTitle>Save payment request settings?</DialogTitle>
            <DialogDescription>
              These changes apply <strong>only to requests created after saving</strong>.
              Requests already submitted keep the approval chain they were created with.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={doSave} disabled={busy}>
              {busy ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
