"use client"

import { getErrorMessage } from "@/lib/errors"
import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useQuery, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import {
  IconArrowLeft,
  IconArchive,
  IconArchiveOff,
  IconDotsVertical,
  IconPencil,
  IconLayoutKanban,
  IconList,
  IconChartBar,
  IconUsers,
  IconTimeline,
  IconTag,
  IconForms,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { hoursToMinutes, minutesToHours } from "@/features/projects/lib/task"
import { ProjectBoard } from "@/features/projects/components/project-board"
import { ProjectTaskList } from "@/features/projects/components/project-task-list"
import { ProjectTimeline } from "@/features/projects/components/project-timeline"
import { ProjectOverview } from "@/features/projects/components/project-overview"
import { ProjectPeople } from "@/features/projects/components/project-people"
import { TaskDetailPanel } from "@/features/projects/components/task-detail-panel"
import { LabelManager } from "@/features/projects/components/task-labels"
import { TaskFieldManager } from "@/features/projects/components/task-custom-fields"
import { emptyFilter, type TaskFilter } from "@/features/projects/lib/task-filter"

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

export function ProjectWorkspace({ projectId }: { projectId: Id<"projects"> }) {
  const member = useCurrentMember()
  const canManage = permitted(member?.permissions, "tasks:manage") ||
    permitted(member?.permissions, "projects:manage")
  const canManageProjects = permitted(member?.permissions, "projects:manage")

  const project = useQuery(api.projects.get, { projectId })
  const board = useQuery(api.projects.board, { projectId })
  const updateProject = useMutation(api.projects.update)

  const [openTaskId, setOpenTaskId] = React.useState<Id<"projectTasks"> | null>(null)
  const [editOpen, setEditOpen] = React.useState(false)
  const [labelsOpen, setLabelsOpen] = React.useState(false)
  const [fieldsOpen, setFieldsOpen] = React.useState(false)
  const [filter, setFilter] = React.useState<TaskFilter>(emptyFilter())

  // Open a task's detail panel from a `?task=` deep link (notification CTAs).
  const searchParams = useSearchParams()
  const taskParam = searchParams.get("task")
  React.useEffect(() => {
    if (taskParam) setOpenTaskId(taskParam as Id<"projectTasks">)
  }, [taskParam])

  if (project === undefined) {
    return (
      <div className="flex flex-col gap-4 px-4 py-6 lg:px-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }
  if (project === null) {
    return (
      <div className="px-4 py-6 lg:px-6">
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link href="/projects">
            <IconArrowLeft className="size-4" />
            Projects
          </Link>
        </Button>
        <p className="text-muted-foreground text-sm">This project isn&apos;t available.</p>
      </div>
    )
  }

  const doneCount =
    board?.tasks.filter((t) => t.status === "done").length ?? 0
  const totalCount = board?.tasks.length ?? 0
  const pct = totalCount ? Math.round((doneCount / totalCount) * 100) : 0

  async function toggleArchive() {
    if (!project) return
    try {
      await updateProject({
        projectId,
        status: project.status === "archived" ? "active" : "archived",
      })
      toast.success(project.status === "archived" ? "Project restored" : "Project archived")
    } catch {
      toast.error("Couldn't update the project.")
    }
  }

  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="px-4 lg:px-6">
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link href="/projects">
            <IconArrowLeft className="size-4" />
            Projects
          </Link>
        </Button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="size-3.5 shrink-0 rounded-full"
                style={{ backgroundColor: project.color ?? "#94a3b8" }}
              />
              <h1 className="truncate text-2xl font-semibold tracking-tight">
                {project.name}
              </h1>
              {project.status === "archived" && (
                <Badge variant="secondary">Archived</Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              {[project.clientName, project.code].filter(Boolean).join(" · ") ||
                project.description ||
                "—"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {totalCount > 0 && (
              <div className="flex flex-col gap-1">
                <div className="text-muted-foreground flex items-center justify-between gap-3 text-xs">
                  <span>Progress</span>
                  <span className="tabular-nums">
                    {doneCount}/{totalCount} · {pct}%
                  </span>
                </div>
                <div className="bg-muted h-1.5 w-40 overflow-hidden rounded-full">
                  <div className="bg-primary h-full rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )}
            {canManageProjects && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <IconDotsVertical className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setEditOpen(true)}>
                    <IconPencil className="size-4" />
                    Edit details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLabelsOpen(true)}>
                    <IconTag className="size-4" />
                    Manage labels
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setFieldsOpen(true)}>
                    <IconForms className="size-4" />
                    Custom fields
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={toggleArchive}>
                    {project.status === "archived" ? (
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
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="board" className="gap-3">
        <div className="px-4 lg:px-6">
          <TabsList>
            <TabsTrigger value="board">
              <IconLayoutKanban className="size-4" />
              Board
            </TabsTrigger>
            <TabsTrigger value="list">
              <IconList className="size-4" />
              List
            </TabsTrigger>
            <TabsTrigger value="timeline">
              <IconTimeline className="size-4" />
              Timeline
            </TabsTrigger>
            {canManageProjects && (
              <TabsTrigger value="overview">
                <IconChartBar className="size-4" />
                Overview
              </TabsTrigger>
            )}
            <TabsTrigger value="people">
              <IconUsers className="size-4" />
              People
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="board">
          <ProjectBoard
            projectId={projectId}
            canManage={canManage}
            onOpenTask={setOpenTaskId}
            filter={filter}
            onFilterChange={setFilter}
          />
        </TabsContent>
        <TabsContent value="list">
          <ProjectTaskList
            projectId={projectId}
            canManage={canManage}
            onOpenTask={setOpenTaskId}
            filter={filter}
            onFilterChange={setFilter}
          />
        </TabsContent>
        <TabsContent value="timeline">
          <ProjectTimeline
            projectId={projectId}
            canManage={canManage}
            onOpenTask={setOpenTaskId}
          />
        </TabsContent>
        {canManageProjects && (
          <TabsContent value="overview">
            <ProjectOverview projectId={projectId} />
          </TabsContent>
        )}
        <TabsContent value="people">
          <ProjectPeople
            projectId={projectId}
            canManage={canManage}
            canManageProjects={canManageProjects}
          />
        </TabsContent>
      </Tabs>

      <TaskDetailPanel
        taskId={openTaskId}
        open={openTaskId !== null}
        onOpenChange={(o) => !o && setOpenTaskId(null)}
      />

      {canManageProjects && (
        <EditProjectDialog
          project={project}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
      {canManageProjects && (
        <>
          <LabelManager open={labelsOpen} onOpenChange={setLabelsOpen} />
          <TaskFieldManager open={fieldsOpen} onOpenChange={setFieldsOpen} />
        </>
      )}
    </div>
  )
}

type Project = NonNullable<FunctionReturnType<typeof api.projects.get>>

function EditProjectDialog({
  project,
  open,
  onOpenChange,
}: {
  project: Project
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const update = useMutation(api.projects.update)
  const [name, setName] = React.useState("")
  const [code, setCode] = React.useState("")
  const [clientName, setClientName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [color, setColor] = React.useState<string>(COLORS[1])
  const [budget, setBudget] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open || !project) return
    setName(project.name)
    setCode(project.code ?? "")
    setClientName(project.clientName ?? "")
    setDescription(project.description ?? "")
    setColor(project.color ?? COLORS[1])
    setBudget(minutesToHours(project.budgetMinutes))
  }, [open, project])

  async function save() {
    if (!name.trim()) {
      toast.error("Give the project a name.")
      return
    }
    setSaving(true)
    try {
      await update({
        projectId: project._id,
        name,
        code,
        clientName,
        description,
        color,
        budgetMinutes: hoursToMinutes(budget) ?? undefined,
      })
      toast.success("Project updated")
      onOpenChange(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't update the project."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit project</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-1">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label className="text-xs">Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label className="text-xs">Client</Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label className="text-xs">Time budget (hours)</Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                placeholder="Auto from tasks"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Colour</Label>
              <div className="flex flex-wrap gap-2 pt-1">
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
