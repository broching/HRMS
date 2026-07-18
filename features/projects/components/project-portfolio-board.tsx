"use client"

import { getErrorMessage } from "@/lib/errors"
import * as React from "react"
import { useRouter } from "next/navigation"
import { useMutation } from "convex/react"
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core"
import { IconClock, IconListCheck, IconAlertTriangle } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { cn } from "@/lib/utils"
import { formatMinutes } from "@/features/timesheets/lib/time"
import { AssigneeAvatars } from "@/features/projects/components/assignee-avatars"
import {
  PHASE_ORDER,
  PHASE_META,
  completionPct,
  type ProjectPhase,
} from "@/features/projects/lib/portfolio"
import type { ProjectCard } from "@/features/projects/components/project-dashboard-card"

export function ProjectPortfolioBoard({
  projects,
  canManage,
}: {
  projects: ProjectCard[]
  canManage: boolean
}) {
  const setPhase = useMutation(api.projects.setProjectPhase)
  const [activeId, setActiveId] = React.useState<string | null>(null)
  // Optimistic phase overrides so a dropped card stays put instantly.
  const [override, setOverride] = React.useState<Record<string, ProjectPhase>>({})

  // Mouse drags after a small movement; touch needs a short hold so swipes
  // scroll the board instead of picking up a card.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  )

  const phaseOf = React.useCallback(
    (p: ProjectCard): ProjectPhase => override[p._id] ?? (p.phase as ProjectPhase),
    [override],
  )

  const byPhase = React.useMemo(() => {
    const m: Record<ProjectPhase, ProjectCard[]> = {
      planning: [],
      active: [],
      on_hold: [],
      completed: [],
    }
    for (const p of projects) m[phaseOf(p)].push(p)
    return m
  }, [projects, phaseOf])

  const activeProject = activeId
    ? projects.find((p) => p._id === activeId) ?? null
    : null

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    setActiveId(null)
    if (!over) return
    const targetPhase = String(over.id) as ProjectPhase
    const project = projects.find((p) => p._id === String(active.id))
    if (!project || !PHASE_ORDER.includes(targetPhase)) return
    if (phaseOf(project) === targetPhase) return
    setOverride((o) => ({ ...o, [project._id]: targetPhase }))
    try {
      await setPhase({ projectId: project._id as Id<"projects">, phase: targetPhase })
    } catch (err) {
      setOverride((o) => {
        const next = { ...o }
        delete next[project._id]
        return next
      })
      toast.error(getErrorMessage(err, "Couldn't move the project."))
    }
  }

  const columns = (
    <div className="flex items-start gap-3 overflow-x-auto px-4 pb-4 lg:px-6">
      {PHASE_ORDER.map((phase) => (
        <PhaseColumn
          key={phase}
          phase={phase}
          projects={byPhase[phase]}
          draggable={canManage}
        />
      ))}
    </div>
  )

  if (!canManage) return columns

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragEnd={handleDragEnd}
    >
      {columns}
      <DragOverlay>
        {activeProject ? <BoardProjectCard project={activeProject} dragging /> : null}
      </DragOverlay>
    </DndContext>
  )
}

function PhaseColumn({
  phase,
  projects,
  draggable,
}: {
  phase: ProjectPhase
  projects: ProjectCard[]
  draggable: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: phase })
  const meta = PHASE_META[phase]
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "bg-muted/40 flex max-h-[calc(100vh-18rem)] w-72 shrink-0 flex-col rounded-xl transition-colors",
        isOver && "ring-primary/40 bg-primary/5 ring-2",
      )}
    >
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span className="size-2.5 rounded-full" style={{ backgroundColor: meta.dot }} />
        <span className="text-sm font-medium">{meta.label}</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {projects.length}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {projects.length === 0 ? (
          <p className="text-muted-foreground px-1 py-8 text-center text-xs">
            Drop projects here
          </p>
        ) : (
          projects.map((p) => (
            <DraggableProject key={p._id} project={p} draggable={draggable} />
          ))
        )}
      </div>
    </div>
  )
}

function DraggableProject({
  project,
  draggable,
}: {
  project: ProjectCard
  draggable: boolean
}) {
  const router = useRouter()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: project._id,
    disabled: !draggable,
  })
  // Distinguish a click (navigate) from a drag (move) by pointer travel.
  const downAt = React.useRef<{ x: number; y: number } | null>(null)
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...(draggable ? listeners : {})}
      onPointerDownCapture={(e) => {
        downAt.current = { x: e.clientX, y: e.clientY }
      }}
      onClick={(e) => {
        const start = downAt.current
        if (start) {
          const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y)
          if (moved > 6) return
        }
        router.push(`/projects/${project._id}`)
      }}
      className={cn("cursor-pointer", isDragging && "opacity-0")}
    >
      <BoardProjectCard project={project} />
    </div>
  )
}

function BoardProjectCard({
  project,
  dragging,
}: {
  project: ProjectCard
  dragging?: boolean
}) {
  const pct = completionPct(project.doneTasks, project.totalTasks)
  return (
    <div
      className={cn(
        "bg-card relative flex cursor-pointer flex-col gap-2.5 overflow-hidden rounded-lg border p-3 pl-3.5 shadow-sm transition",
        "hover:border-primary/30",
        dragging && "ring-primary/40 rotate-1 shadow-lg ring-2",
      )}
    >
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ backgroundColor: project.color ?? "#94a3b8" }}
        aria-hidden
      />
      <p className="truncate text-sm font-medium">{project.name}</p>

      {project.totalTasks > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-muted-foreground flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1">
              <IconListCheck className="size-3" />
              {project.doneTasks}/{project.totalTasks}
            </span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div className="bg-muted h-1 overflow-hidden rounded-full">
            <div className="bg-primary h-full rounded-full" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <AssigneeAvatars people={project.people} max={4} size="size-5" />
        <span
          className={cn(
            "text-muted-foreground flex items-center gap-1 text-[11px] tabular-nums",
            project.overBudget && "text-red-600 dark:text-red-400",
          )}
        >
          {project.overBudget ? (
            <IconAlertTriangle className="size-3" />
          ) : (
            <IconClock className="size-3" />
          )}
          {formatMinutes(project.minutes)}
        </span>
      </div>
    </div>
  )
}
