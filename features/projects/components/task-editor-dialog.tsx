"use client"

import { getErrorMessage } from "@/lib/errors"
import * as React from "react"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
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
import { AssigneePicker } from "@/features/projects/components/assignee-picker"
import { TaskRichEditor } from "@/features/projects/components/task-rich-editor"
import { LabelPicker } from "@/features/projects/components/task-labels"
import {
  CustomFieldsEditor,
  type CustomFieldValues,
} from "@/features/projects/components/task-custom-fields"
import {
  PRIORITY_OPTIONS,
  hoursToMinutes,
  minutesToHours,
  type TaskPriority,
} from "@/features/projects/lib/task"

const NONE = "__none__"

export type TaskEditorValue = {
  taskId: Id<"projectTasks">
  name: string
  description: string | null
  priority: TaskPriority | null
  dueDate: string | null
  startDate: string | null
  estimateMinutes: number | null
  assigneeIds: Id<"employees">[]
  labelIds: Id<"taskLabels">[]
  customFields: CustomFieldValues
  milestoneId: Id<"projectMilestones"> | null
}

/**
 * Create or edit a task. On create it inserts the task (into `stageId`, with any
 * task-level assignees, labels, dates and custom fields). On edit it patches the
 * fields and replaces the task-level assignee set. Moving a task between columns
 * happens on the board.
 */
export function TaskEditorDialog({
  open,
  onOpenChange,
  projectId,
  stageId,
  task,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  projectId: Id<"projects">
  stageId?: Id<"projectStages">
  task?: TaskEditorValue | null
}) {
  const createTask = useMutation(api.projects.createTask)
  const updateTask = useMutation(api.projects.updateTask)
  const assignTask = useMutation(api.projects.assignTask)
  const stages = useQuery(api.projects.listStages, open ? { projectId } : "skip")
  const milestones = useQuery(
    api.projects.listMilestones,
    open ? { projectId } : "skip",
  )
  const fieldDefs = useQuery(api.taskFields.list, open ? {} : "skip")

  const editing = task ?? null

  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [priority, setPriority] = React.useState<string>(NONE)
  const [dueDate, setDueDate] = React.useState("")
  const [startDate, setStartDate] = React.useState("")
  const [estimate, setEstimate] = React.useState("")
  const [stage, setStage] = React.useState<string>("")
  const [assignees, setAssignees] = React.useState<Id<"employees">[]>([])
  const [labelIds, setLabelIds] = React.useState<Id<"taskLabels">[]>([])
  const [milestoneId, setMilestoneId] = React.useState<string>(NONE)
  const [customFields, setCustomFields] = React.useState<CustomFieldValues>({})
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    if (editing) {
      setName(editing.name)
      setDescription(editing.description ?? "")
      setPriority(editing.priority ?? NONE)
      setDueDate(editing.dueDate ?? "")
      setStartDate(editing.startDate ?? "")
      setEstimate(minutesToHours(editing.estimateMinutes))
      setAssignees(editing.assigneeIds)
      setLabelIds(editing.labelIds ?? [])
      setMilestoneId(editing.milestoneId ?? NONE)
      setCustomFields(editing.customFields ?? {})
    } else {
      setName("")
      setDescription("")
      setPriority(NONE)
      setDueDate("")
      setStartDate("")
      setEstimate("")
      setStage(stageId ?? "")
      setAssignees([])
      setLabelIds([])
      setMilestoneId(NONE)
      setCustomFields({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  React.useEffect(() => {
    if (!open || editing) return
    if (!stage && stages && stages.length > 0) setStage(stageId ?? stages[0]._id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stages, open])

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Give the task a name.")
      return
    }
    setSaving(true)
    try {
      const prio = priority === NONE ? undefined : (priority as TaskPriority)
      const estMinutes = hoursToMinutes(estimate)
      const milestone = milestoneId === NONE ? null : (milestoneId as Id<"projectMilestones">)
      if (editing) {
        await updateTask({
          taskId: editing.taskId,
          name,
          description: description.trim() || null,
          priority: prio ?? null,
          dueDate: dueDate || null,
          startDate: startDate || null,
          estimateMinutes: estMinutes,
          labelIds,
          customFields,
          milestoneId: milestone,
        })
        await assignTask({ taskId: editing.taskId, employeeIds: assignees })
        toast.success("Task updated")
      } else {
        const newId = await createTask({
          projectId,
          stageId: (stage || undefined) as Id<"projectStages"> | undefined,
          name,
          description: description.trim() || undefined,
          priority: prio,
          dueDate: dueDate || undefined,
          startDate: startDate || undefined,
          estimateMinutes: estMinutes ?? undefined,
          assigneeIds: assignees.length ? assignees : undefined,
          labelIds: labelIds.length ? labelIds : undefined,
        })
        // Custom fields + milestone are patched after create (create keeps a lean
        // arg surface; both are optional and default empty).
        if (Object.keys(customFields).length > 0 || milestone) {
          await updateTask({
            taskId: newId,
            customFields,
            milestoneId: milestone,
          })
        }
        toast.success("Task created")
      }
      onOpenChange(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save the task."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit task" : "New task"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-1">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Task name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Description</Label>
            <TaskRichEditor
              value={description}
              onChange={setDescription}
              placeholder="Add detail, a checklist, links…"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Labels</Label>
            <LabelPicker value={labelIds} onChange={setLabelIds} canManage />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label className="text-xs">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {PRIORITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label className="text-xs">Estimate (hours)</Label>
              <Input
                type="number"
                min={0}
                step={0.25}
                placeholder="—"
                value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label className="text-xs">Start date</Label>
              <Input
                type="date"
                className="w-full min-w-0"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label className="text-xs">Due date</Label>
              <Input
                type="date"
                className="w-full min-w-0"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {!editing && (
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label className="text-xs">Column</Label>
                <Select value={stage} onValueChange={setStage}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a column" />
                  </SelectTrigger>
                  <SelectContent>
                    {(stages ?? []).map((s) => (
                      <SelectItem key={s._id} value={s._id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {(milestones ?? []).length > 0 && (
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label className="text-xs">Milestone</Label>
                <Select value={milestoneId} onValueChange={setMilestoneId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {(milestones ?? []).map((m) => (
                      <SelectItem key={m._id} value={m._id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {fieldDefs && fieldDefs.some((d) => d.active) && (
            <CustomFieldsEditor
              defs={fieldDefs}
              values={customFields}
              onChange={setCustomFields}
            />
          )}

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Assign people (optional)</Label>
            <AssigneePicker value={assignees} onChange={setAssignees} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save task" : "Create task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
