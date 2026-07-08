"use client"

import * as React from "react"
import { IconTrash, IconPlus, IconGripVertical, IconChevronDown } from "@tabler/icons-react"
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
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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

// One editable approval step in the leave chain. `value` holds the position key
// ("manager" | "department_head") or a roleId; `userIds` holds the people for a
// "specific" step. `daysMoreThan` is kept as a display string while editing.
export type LeaveStepForm = {
  key: string
  approverType: "position" | "role" | "specific"
  value: string
  userIds: Id<"users">[]
  thresholdEnabled: boolean
  daysMoreThan: string
}

export function newLeaveStepKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

// Compact multi-select for the "specific person(s)" picker.
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
          className="h-auto min-h-9 w-56 justify-between font-normal"
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

const ordinal = (i: number) =>
  i === 0 ? "1st" : i === 1 ? "2nd" : i === 2 ? "3rd" : `${i + 1}th`

// Ordered, drag-sortable list of leave approval steps. Mirrors the claims
// approval-flow editor but with leave's approver types (direct manager /
// department head / role / specific person(s)) and a day-count threshold.
export function LeaveApprovalChainEditor({
  steps,
  onChange,
  roleOpts,
  memberOpts,
}: {
  steps: LeaveStepForm[]
  onChange: (next: LeaveStepForm[]) => void
  roleOpts: { value: string; label: string }[]
  memberOpts: { value: string; label: string }[]
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  function patchStep(i: number, p: Partial<LeaveStepForm>) {
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
  const typeLabel = (s: LeaveStepForm) =>
    s.approverType === "role"
      ? "Role"
      : s.approverType === "specific"
        ? "Specific person(s)"
        : "Position"

  return (
    <div className="flex flex-col gap-5">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={steps.map((s) => s.key)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-5">
            {steps.map((step, i) => (
              <SortableStep key={step.key} id={step.key}>
                {(handle) => (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {handle}
                      <span className="text-muted-foreground w-20 text-sm">
                        {ordinal(i)} Approver
                      </span>
                      <Select
                        value={step.approverType}
                        onValueChange={(v) =>
                          patchStep(i, {
                            approverType: v as LeaveStepForm["approverType"],
                            value: v === "position" ? "manager" : "",
                            userIds: [],
                          })
                        }
                      >
                        <SelectTrigger className="w-44">
                          <SelectValue>{typeLabel(step)}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="position">Position</SelectItem>
                          <SelectItem value="role">Role</SelectItem>
                          <SelectItem value="specific">
                            Specific person(s)
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
                      ) : step.approverType === "role" ? (
                        <Select
                          value={step.value}
                          onValueChange={(v) => patchStep(i, { value: v })}
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
                        <MultiSelect
                          options={memberOpts}
                          selected={step.userIds as string[]}
                          onChange={(v) =>
                            patchStep(i, { userIds: v as Id<"users">[] })
                          }
                          placeholder="Choose person(s)"
                        />
                      )}

                      {steps.length > 1 && (
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-8 text-destructive"
                          onClick={() =>
                            onChange(steps.filter((_, j) => j !== i))
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
                          patchStep(i, { thresholdEnabled: c === true })
                        }
                      />
                      Enable threshold
                    </label>

                    {step.thresholdEnabled && (
                      <div className="border-primary/40 bg-muted/40 ml-28 flex flex-wrap items-end gap-3 border-l-2 p-3 text-sm">
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs">
                            Applies when days is more than
                          </Label>
                          <Input
                            className="w-40"
                            inputMode="decimal"
                            placeholder="e.g. 3"
                            value={step.daysMoreThan}
                            onChange={(e) =>
                              patchStep(i, { daysMoreThan: e.target.value })
                            }
                          />
                        </div>
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
              key: newLeaveStepKey(),
              approverType: "position",
              value: "manager",
              userIds: [],
              thresholdEnabled: false,
              daysMoreThan: "",
            },
          ])
        }
      >
        <IconPlus className="mr-1 inline size-4" />
        Add approver
      </button>
    </div>
  )
}
