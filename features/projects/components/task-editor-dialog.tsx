"use client"

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
  estimateMinutes: number | null
  assigneeIds: Id<"employees">[]
}

/**
 * Create or edit a task. On create it inserts the task (into `stageId`, with any
 * task-level assignees). On edit it patches the fields and replaces the
 * task-level assignee set. Moving a task between columns happens on the board.
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

  const editing = task ?? null

  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [priority, setPriority] = React.useState<string>(NONE)
  const [dueDate, setDueDate] = React.useState("")
  const [estimate, setEstimate] = React.useState("")
  const [stage, setStage] = React.useState<string>("")
  const [assignees, setAssignees] = React.useState<Id<"employees">[]>([])
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    if (editing) {
      setName(editing.name)
      setDescription(editing.description ?? "")
      setPriority(editing.priority ?? NONE)
      setDueDate(editing.dueDate ?? "")
      setEstimate(minutesToHours(editing.estimateMinutes))
      setAssignees(editing.assigneeIds)
    } else {
      setName("")
      setDescription("")
      setPriority(NONE)
      setDueDate("")
      setEstimate("")
      setStage(stageId ?? "")
      setAssignees([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Default the create-column to the first stage once stages load.
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
      if (editing) {
        await updateTask({
          taskId: editing.taskId,
          name,
          description: description.trim() || null,
          priority: prio ?? null,
          dueDate: dueDate || null,
          estimateMinutes: estMinutes,
        })
        await assignTask({ taskId: editing.taskId, employeeIds: assignees })
        toast.success("Task updated")
      } else {
        await createTask({
          projectId,
          stageId: (stage || undefined) as Id<"projectStages"> | undefined,
          name,
          description: description.trim() || undefined,
          priority: prio,
          dueDate: dueDate || undefined,
          estimateMinutes: estMinutes ?? undefined,
          assigneeIds: assignees.length ? assignees : undefined,
        })
        toast.success("Task created")
      }
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the task.")
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
              <Label className="text-xs">Due date</Label>
              <Input
                type="date"
                className="w-full min-w-0"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
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
          </div>

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
