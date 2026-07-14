"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import {
  IconPlus,
  IconFolder,
  IconArchive,
  IconArchiveOff,
  IconCheck,
  IconUsers,
  IconPaperclip,
  IconChevronRight,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { permitted } from "@/convex/lib/permissions"
import { useCurrentMember } from "@/hooks/use-current-member"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { formatMinutes } from "@/features/timesheets/lib/time"
import {
  dueMeta,
  dueToneClasses,
  priorityClasses,
  priorityLabel,
  type TaskPriority,
} from "@/features/projects/lib/task"
import { AssigneePicker } from "@/features/projects/components/assignee-picker"
import { TaskDetailPanel } from "@/features/projects/components/task-detail-panel"
import { TaskEditorDialog } from "@/features/projects/components/task-editor-dialog"

type Project = FunctionReturnType<typeof api.projects.list>[number]
type Stat = FunctionReturnType<typeof api.projects.stats>[number]
type Task = FunctionReturnType<typeof api.projects.listTasks>[number]

const COLORS = [
  "#22c55e",
  "#3b82f6",
  "#f97316",
  "#a855f7",
  "#14b8a6",
  "#eab308",
  "#ec4899",
  "#64748b",
]

export function ProjectsManager() {
  const member = useCurrentMember()
  const canManageProjects = permitted(member?.permissions, "projects:manage")

  const projects = useQuery(api.projects.list)
  // Time roll-ups are org-wide oversight — only for projects:manage (HR).
  const stats = useQuery(api.projects.stats, canManageProjects ? {} : "skip")
  const [showArchived, setShowArchived] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [manage, setManage] = React.useState<Project | null>(null)

  const statMap = React.useMemo(() => {
    const m = new Map<string, Stat>()
    for (const s of stats ?? []) m.set(s.projectId, s)
    return m
  }, [stats])

  const visible = (projects ?? []).filter((p) =>
    showArchived ? true : p.status === "active",
  )
  const totalMinutes = (stats ?? []).reduce((s, x) => s + x.minutes, 0)

  return (
    <div className="flex flex-col gap-4 px-4 py-6 lg:px-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Projects</h1>
          <p className="text-muted-foreground text-sm">
            Projects and tasks employees log their time against
            {totalMinutes > 0 && (
              <> · {formatMinutes(totalMinutes)} logged all-time</>
            )}
            .
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManageProjects && (
            <Button variant="outline" size="sm" onClick={() => setShowArchived((s) => !s)}>
              {showArchived ? "Hide archived" : "Show archived"}
            </Button>
          )}
          {canManageProjects && (
            <Button onClick={() => setCreateOpen(true)}>
              <IconPlus className="size-4" />
              New project
            </Button>
          )}
        </div>
      </div>

      {projects === undefined ? (
        <Skeleton className="h-48 w-full" />
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <IconFolder className="text-muted-foreground size-8" stroke={1.5} />
          <p className="text-muted-foreground text-sm">No projects yet.</p>
          {canManageProjects && (
            <Button onClick={() => setCreateOpen(true)}>
              <IconPlus className="size-4" />
              New project
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => {
            const stat = statMap.get(p._id)
            return (
              <button
                key={p._id}
                type="button"
                onClick={() => setManage(p)}
                className="hover:border-primary/40 hover:bg-accent/40 rounded-xl border p-4 text-left transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="size-3 rounded-full"
                    style={{ backgroundColor: p.color ?? "#94a3b8" }}
                  />
                  <span className="flex-1 truncate font-medium">{p.name}</span>
                  {p.status === "archived" && (
                    <Badge variant="secondary" className="text-[10px]">
                      Archived
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground mt-1 line-clamp-2 min-h-[2rem] text-xs">
                  {p.description || p.clientName || "—"}
                </p>
                <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums">
                  {stat && (
                    <span className="text-foreground font-medium">
                      {formatMinutes(stat.minutes)}
                    </span>
                  )}
                  {stat && stat.openTasks > 0 && <span>{stat.openTasks} open</span>}
                  {stat && (
                    <span className="flex items-center gap-1">
                      <IconUsers className="size-3" />
                      {stat.assignees}
                    </span>
                  )}
                  {p.code && <span className="ml-auto">{p.code}</span>}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {canManageProjects && (
        <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
      )}
      <ManageProjectDialog
        project={manage}
        canManageProjects={canManageProjects}
        onClose={() => setManage(null)}
      />
    </div>
  )
}

function CreateProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const create = useMutation(api.projects.create)
  const [name, setName] = React.useState("")
  const [code, setCode] = React.useState("")
  const [clientName, setClientName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [color, setColor] = React.useState(COLORS[1])
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setName("")
      setCode("")
      setClientName("")
      setDescription("")
      setColor(COLORS[1])
    }
  }, [open])

  async function handleCreate() {
    if (!name.trim()) {
      toast.error("Give the project a name.")
      return
    }
    setSaving(true)
    try {
      await create({
        name,
        code: code || undefined,
        clientName: clientName || undefined,
        description: description || undefined,
        color,
      })
      toast.success("Project created")
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the project.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-1">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label className="text-xs">Code (optional)</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label className="text-xs">Client (optional)</Label>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Description (optional)</Label>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Colour</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Colour ${c}`}
                  className={cn(
                    "size-6 rounded-full ring-offset-2 transition",
                    color === c && "ring-primary ring-2",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? "Creating…" : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ManageProjectDialog({
  project,
  canManageProjects,
  onClose,
}: {
  project: Project | null
  canManageProjects: boolean
  onClose: () => void
}) {
  const updateProject = useMutation(api.projects.update)
  const setTaskStatus = useMutation(api.projects.setTaskStatus)
  const assignProject = useMutation(api.projects.assignProject)

  const tasks = useQuery(
    api.projects.listTasks,
    project ? { projectId: project._id } : "skip",
  )
  const detail = useQuery(
    api.projects.detail,
    project && canManageProjects ? { projectId: project._id } : "skip",
  )
  const assigneesData = useQuery(
    api.projects.projectAssignees,
    project ? { projectId: project._id } : "skip",
  )

  const [newTaskOpen, setNewTaskOpen] = React.useState(false)
  const [openTaskId, setOpenTaskId] = React.useState<Id<"projectTasks"> | null>(null)
  const [peopleOpen, setPeopleOpen] = React.useState(false)
  const [projAssignees, setProjAssignees] = React.useState<Id<"employees">[]>([])
  const [savingPeople, setSavingPeople] = React.useState(false)

  // Seed the project-assignee editor whenever the loaded set changes.
  const loadedProjIds = React.useMemo(
    () => (assigneesData?.project ?? []).map((a) => a.employeeId),
    [assigneesData],
  )
  React.useEffect(() => {
    setProjAssignees(loadedProjIds)
  }, [loadedProjIds])

  const peopleDirty =
    JSON.stringify([...projAssignees].sort()) !==
    JSON.stringify([...loadedProjIds].sort())

  async function savePeople() {
    if (!project) return
    setSavingPeople(true)
    try {
      await assignProject({ projectId: project._id, employeeIds: projAssignees })
      toast.success("Project team updated")
      setPeopleOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update the team.")
    } finally {
      setSavingPeople(false)
    }
  }

  async function toggleArchive() {
    if (!project) return
    try {
      await updateProject({
        projectId: project._id,
        status: project.status === "archived" ? "active" : "archived",
      })
      toast.success(project.status === "archived" ? "Project restored" : "Project archived")
      onClose()
    } catch {
      toast.error("Couldn't update the project.")
    }
  }

  return (
    <>
      <Dialog open={project !== null} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[85vh] overflow-x-hidden overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span
                className="size-3 rounded-full"
                style={{ backgroundColor: project?.color ?? "#94a3b8" }}
              />
              {project?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-1">
            {/* Activity: top-down view of who logged time and against what */}
            {detail && detail.totalMinutes > 0 && (
              <div className="bg-muted/30 flex flex-col gap-3 rounded-lg border p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-muted-foreground text-xs">Total logged</span>
                  <span className="text-lg font-semibold tabular-nums">
                    {formatMinutes(detail.totalMinutes)}
                  </span>
                </div>
                {detail.byEmployee.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                      Contributors
                    </span>
                    {detail.byEmployee.slice(0, 5).map((e) => {
                      const pct = detail.totalMinutes
                        ? (e.minutes / detail.totalMinutes) * 100
                        : 0
                      return (
                        <div key={e.employeeId} className="flex flex-col gap-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="truncate">{e.name}</span>
                            <span className="text-muted-foreground tabular-nums">
                              {formatMinutes(e.minutes)}
                            </span>
                          </div>
                          <div className="bg-muted h-1 overflow-hidden rounded-full">
                            <div
                              className="bg-primary h-full rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Project team (whole-project assignees) */}
            <div className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <Label className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <IconUsers className="size-3.5" />
                  Project team ({loadedProjIds.length})
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7"
                  onClick={() => setPeopleOpen((o) => !o)}
                >
                  {peopleOpen ? "Done" : "Edit"}
                </Button>
              </div>
              {peopleOpen ? (
                <div className="flex flex-col gap-2">
                  <p className="text-muted-foreground text-[11px]">
                    People on the project team see every task and can log time
                    against the whole project.
                  </p>
                  <AssigneePicker value={projAssignees} onChange={setProjAssignees} />
                  {peopleDirty && (
                    <Button size="sm" onClick={savePeople} disabled={savingPeople}>
                      {savingPeople ? "Saving…" : "Save team"}
                    </Button>
                  )}
                </div>
              ) : loadedProjIds.length === 0 ? (
                <p className="text-muted-foreground text-xs">
                  No one on the project team yet.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {(assigneesData?.project ?? []).map((a) => (
                    <Badge key={a.employeeId} variant="secondary" className="font-normal">
                      {a.name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Tasks */}
            <div className="flex items-center justify-between">
              <Label className="text-muted-foreground text-xs">Tasks</Label>
              {project && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() => setNewTaskOpen(true)}
                >
                  <IconPlus className="size-4" />
                  New task
                </Button>
              )}
            </div>
            {tasks === undefined ? (
              <Skeleton className="h-20 w-full" />
            ) : tasks.length === 0 ? (
              <p className="text-muted-foreground text-xs">No tasks yet.</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {tasks.map((t) => (
                  <TaskListRow
                    key={t._id}
                    task={t}
                    onToggle={() =>
                      setTaskStatus({
                        taskId: t._id,
                        status: t.status === "done" ? "open" : "done",
                      })
                    }
                    onOpen={() => setOpenTaskId(t._id)}
                  />
                ))}
              </ul>
            )}
          </div>

          {canManageProjects && (
            <DialogFooter>
              <Button variant="outline" onClick={toggleArchive}>
                {project?.status === "archived" ? (
                  <>
                    <IconArchiveOff className="size-4" />
                    Restore project
                  </>
                ) : (
                  <>
                    <IconArchive className="size-4" />
                    Archive project
                  </>
                )}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {project && (
        <TaskEditorDialog
          open={newTaskOpen}
          onOpenChange={setNewTaskOpen}
          projectId={project._id}
        />
      )}

      <TaskDetailPanel
        taskId={openTaskId}
        open={openTaskId !== null}
        onOpenChange={(o) => !o && setOpenTaskId(null)}
      />
    </>
  )
}

function TaskListRow({
  task,
  onToggle,
  onOpen,
}: {
  task: Task
  onToggle: () => void
  onOpen: () => void
}) {
  const done = task.status === "done"
  const due = dueMeta(task.dueDate, task.status)
  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded border",
          done ? "bg-primary border-primary text-primary-foreground" : "border-input",
        )}
        aria-label="Toggle done"
      >
        {done && <IconCheck className="size-3.5" />}
      </button>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
      >
        <span
          className={cn(
            "w-full truncate text-sm",
            done && "text-muted-foreground line-through",
          )}
        >
          {task.name}
        </span>
        <span className="flex w-full flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
          {task.priority && (
            <span
              className={cn(
                "rounded-full border px-1.5",
                priorityClasses(task.priority as TaskPriority),
              )}
            >
              {priorityLabel(task.priority as TaskPriority)}
            </span>
          )}
          {due && (
            <span className={dueToneClasses(due.tone)}>{due.label}</span>
          )}
          {task.assigneeCount > 0 && (
            <span className="text-muted-foreground flex items-center gap-0.5">
              <IconUsers className="size-3" />
              {task.assigneeCount}
            </span>
          )}
          {task.attachmentCount > 0 && (
            <span className="text-muted-foreground flex items-center gap-0.5">
              <IconPaperclip className="size-3" />
              {task.attachmentCount}
            </span>
          )}
        </span>
      </button>
      <IconChevronRight
        className="text-muted-foreground size-4 shrink-0"
        aria-hidden
      />
    </li>
  )
}
