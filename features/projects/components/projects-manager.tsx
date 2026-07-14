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
  IconTrash,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
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

type Project = FunctionReturnType<typeof api.projects.list>[number]
type Stat = FunctionReturnType<typeof api.projects.stats>[number]

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
  const projects = useQuery(api.projects.list)
  const stats = useQuery(api.projects.stats)
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
          <Button variant="outline" size="sm" onClick={() => setShowArchived((s) => !s)}>
            {showArchived ? "Hide archived" : "Show archived"}
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <IconPlus className="size-4" />
            New project
          </Button>
        </div>
      </div>

      {projects === undefined ? (
        <Skeleton className="h-48 w-full" />
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <IconFolder className="text-muted-foreground size-8" stroke={1.5} />
          <p className="text-muted-foreground text-sm">No projects yet.</p>
          <Button onClick={() => setCreateOpen(true)}>
            <IconPlus className="size-4" />
            New project
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => (
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
              <div className="text-muted-foreground mt-2 flex items-center gap-3 text-[11px] tabular-nums">
                <span className="text-foreground font-medium">
                  {formatMinutes(statMap.get(p._id)?.minutes ?? 0)}
                </span>
                <span>{statMap.get(p._id)?.contributors ?? 0} people</span>
                {p.code && <span className="ml-auto">{p.code}</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ManageProjectDialog project={manage} onClose={() => setManage(null)} />
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-1">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Code (optional)</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
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
  onClose,
}: {
  project: Project | null
  onClose: () => void
}) {
  const updateProject = useMutation(api.projects.update)
  const createTask = useMutation(api.projects.createTask)
  const updateTask = useMutation(api.projects.updateTask)
  const tasks = useQuery(
    api.projects.listTasks,
    project ? { projectId: project._id as Id<"projects"> } : "skip",
  )
  const detail = useQuery(
    api.projects.detail,
    project ? { projectId: project._id as Id<"projects"> } : "skip",
  )
  const [newTask, setNewTask] = React.useState("")

  async function addTask() {
    if (!project || !newTask.trim()) return
    try {
      await createTask({ projectId: project._id, name: newTask })
      setNewTask("")
    } catch {
      toast.error("Couldn't add the task.")
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
    <Dialog open={project !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
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
              {detail.byTask.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                    By task
                  </span>
                  {detail.byTask.slice(0, 5).map((t) => (
                    <div
                      key={t.taskId ?? "none"}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="truncate">{t.name}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {formatMinutes(t.minutes)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <Label className="text-muted-foreground text-xs">Tasks</Label>
          {tasks === undefined ? (
            <Skeleton className="h-20 w-full" />
          ) : tasks.length === 0 ? (
            <p className="text-muted-foreground text-xs">No tasks yet.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {tasks.map((t) => (
                <li key={t._id} className="flex items-center gap-2 px-3 py-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateTask({
                        taskId: t._id,
                        status: t.status === "done" ? "open" : "done",
                      })
                    }
                    className={cn(
                      "flex size-5 items-center justify-center rounded border",
                      t.status === "done"
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-input",
                    )}
                    aria-label="Toggle done"
                  >
                    {t.status === "done" && <IconCheck className="size-3.5" />}
                  </button>
                  <span
                    className={cn(
                      "flex-1 text-sm",
                      t.status === "done" && "text-muted-foreground line-through",
                    )}
                  >
                    {t.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive size-7"
                    onClick={() => updateTask({ taskId: t._id, archived: true })}
                    aria-label="Remove task"
                  >
                    <IconTrash className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-2">
            <Input
              placeholder="Add a task"
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  addTask()
                }
              }}
            />
            <Button variant="outline" onClick={addTask} disabled={!newTask.trim()}>
              <IconPlus className="size-4" />
              Add
            </Button>
          </div>
        </div>

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
      </DialogContent>
    </Dialog>
  )
}
