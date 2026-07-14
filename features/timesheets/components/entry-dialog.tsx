"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { IconClockHour4, IconTrash, IconUser } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
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
import { ConfirmDialog } from "@/features/claims/components/confirm-dialog"
import { cn } from "@/lib/utils"
import {
  clockToMinutes,
  hoursToMinutes,
  minutesToClock,
  minutesToHours,
} from "@/features/timesheets/lib/time"

type Project = FunctionReturnType<typeof api.projects.list>[number]
type Entry = FunctionReturnType<typeof api.timeEntries.mine>[number]

const NONE = "__none__"
const DURATION_CHIPS = [15, 30, 60, 120, 240] // minutes

/** What a caller wants pre-filled when opening the dialog. */
export type EntryDraft = {
  entry?: Entry | null // editing an existing entry
  date?: string
  startMinute?: number | null
  projectId?: string
  taskId?: string
  minutes?: number
  // When logging on behalf of someone else (team / HR views): the target
  // employee and their name for the header. Omitted = the caller's own time.
  employeeId?: string
  employeeName?: string
}

export function EntryDialog({
  open,
  draft,
  projects,
  onOpenChange,
}: {
  open: boolean
  draft: EntryDraft
  projects: Project[]
  onOpenChange: (o: boolean) => void
}) {
  const create = useMutation(api.timeEntries.create)
  const update = useMutation(api.timeEntries.update)
  const remove = useMutation(api.timeEntries.remove)

  const editing = draft.entry ?? null

  const [date, setDate] = React.useState("")
  const [projectId, setProjectId] = React.useState<string>("")
  const [taskId, setTaskId] = React.useState<string>(NONE)
  const [minutes, setMinutes] = React.useState<number>(60)
  const [start, setStart] = React.useState<string>("") // "HH:MM" or ""
  const [description, setDescription] = React.useState("")
  const [billable, setBillable] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  // Seed the form each time the dialog opens.
  React.useEffect(() => {
    if (!open) return
    if (editing) {
      setDate(editing.date)
      setProjectId(editing.projectId)
      setTaskId(editing.taskId ?? NONE)
      setMinutes(editing.minutes)
      setStart(editing.startMinute != null ? minutesToClock(editing.startMinute) : "")
      setDescription(editing.description)
      setBillable(editing.billable)
    } else {
      setDate(draft.date ?? "")
      setProjectId(draft.projectId ?? projects[0]?._id ?? "")
      setTaskId(draft.taskId ?? NONE)
      setMinutes(draft.minutes ?? 60)
      setStart(
        draft.startMinute != null ? minutesToClock(draft.startMinute) : "",
      )
      setDescription("")
      setBillable(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const tasks =
    useQuery(
      api.projects.listTasks,
      projectId ? { projectId: projectId as Id<"projects"> } : "skip",
    ) ?? []

  const hoursValue = minutesToHours(minutes)

  async function handleSave() {
    const project = projectId as Id<"projects">
    if (!project) {
      toast.error("Pick a project.")
      return
    }
    if (!minutes || minutes <= 0) {
      toast.error("Enter how long you worked.")
      return
    }
    const startMinute = clockToMinutes(start)
    if (startMinute != null && startMinute + minutes > 24 * 60) {
      toast.error("That start time runs past midnight — shorten the duration.")
      return
    }
    setSaving(true)
    try {
      const task = taskId === NONE ? undefined : (taskId as Id<"projectTasks">)
      if (editing) {
        await update({
          entryId: editing._id,
          date,
          projectId: project,
          taskId: taskId === NONE ? null : task,
          minutes,
          startMinute: startMinute ?? null,
          description,
          billable,
        })
      } else {
        await create({
          date,
          projectId: project,
          taskId: task,
          minutes,
          startMinute: startMinute ?? undefined,
          description,
          billable,
          employeeId: draft.employeeId
            ? (draft.employeeId as Id<"employees">)
            : undefined,
        })
      }
      toast.success(editing ? "Entry updated" : "Time logged")
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the entry.")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!editing) return
    setSaving(true)
    try {
      await remove({ entryId: editing._id })
      toast.success("Entry deleted")
      onOpenChange(false)
    } catch {
      toast.error("Couldn't delete the entry.")
    } finally {
      setSaving(false)
    }
  }

  const activeProject = projects.find((p) => p._id === projectId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconClockHour4 className="size-5" />
            {editing ? "Edit entry" : "Log time"}
          </DialogTitle>
        </DialogHeader>

        {draft.employeeName && (
          <div className="bg-muted/50 text-muted-foreground flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
            <IconUser className="size-3.5 shrink-0" />
            <span>
              Logging on behalf of{" "}
              <span className="text-foreground font-medium">
                {draft.employeeName}
              </span>
            </span>
          </div>
        )}

        <div className="flex flex-col gap-4 py-1">
          {/* Project → task → comment: the logging spine */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Project</Label>
            <Select
              value={projectId}
              onValueChange={(v) => {
                setProjectId(v)
                setTaskId(NONE)
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: p.color ?? "#94a3b8" }}
                      />
                      {p.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Task</Label>
            <Select value={taskId} onValueChange={setTaskId} disabled={!projectId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="No task" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No task</SelectItem>
                {tasks.map((t) => (
                  <SelectItem key={t._id} value={t._id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeProject && tasks.length === 0 && (
              <p className="text-muted-foreground text-[11px]">
                No tasks on this project — log against the project itself.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">What did you work on?</Label>
            <Textarea
              rows={2}
              placeholder="Short description of the work"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* When + how long. `min-w-0` lets the native date/time inputs shrink
              inside the grid instead of forcing horizontal overflow on mobile. */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                className="w-full min-w-0"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label className="text-xs">Start time (optional)</Label>
              <Input
                type="time"
                className="w-full min-w-0"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Duration</Label>
            <div className="flex flex-wrap gap-1.5">
              {DURATION_CHIPS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMinutes(m)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    minutes === m
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "hover:bg-accent border-input",
                  )}
                >
                  {m < 60 ? `${m}m` : `${m / 60}h`}
                </button>
              ))}
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  step={0.25}
                  inputMode="decimal"
                  className="h-7 w-20"
                  value={hoursValue || ""}
                  onChange={(e) => setMinutes(hoursToMinutes(Number(e.target.value)))}
                />
                <span className="text-muted-foreground text-xs">h</span>
              </div>
            </div>
          </div>

          {/* Billable toggle */}
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div className="flex flex-col">
              <Label htmlFor="billable" className="text-xs">
                Billable
              </Label>
              <span className="text-muted-foreground text-[11px]">
                Count this time toward billable hours.
              </span>
            </div>
            <Switch
              id="billable"
              checked={billable}
              onCheckedChange={setBillable}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {editing ? (
            <Button
              variant="outline"
              className="border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive"
              onClick={() => setConfirmOpen(true)}
              disabled={saving}
            >
              <IconTrash className="size-4" />
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save" : "Log time"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete this entry?"
        description="This time entry will be permanently removed. This can't be undone."
        confirmLabel="Delete entry"
        destructive
        busy={saving}
        onConfirm={async () => {
          await handleDelete()
          setConfirmOpen(false)
        }}
      />
    </Dialog>
  )
}
