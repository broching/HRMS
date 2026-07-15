"use client"

import Link from "next/link"
import type { FunctionReturnType } from "convex/server"
import {
  IconClock,
  IconListCheck,
  IconAlertTriangle,
  IconUser,
} from "@tabler/icons-react"
import type { api } from "@/convex/_generated/api"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { formatMinutes } from "@/features/timesheets/lib/time"
import { AssigneeAvatars } from "@/features/projects/components/assignee-avatars"
import {
  PHASE_META,
  completionPct,
  type ProjectPhase,
} from "@/features/projects/lib/portfolio"

export type ProjectCard = FunctionReturnType<typeof api.projects.dashboard>[number]

// The portfolio signature: a colour-spined card with a progress meter, a
// logged-vs-budget line, and an overlapping stack of the people involved.
export function ProjectDashboardCard({ project }: { project: ProjectCard }) {
  const phase = PHASE_META[project.phase as ProjectPhase]
  const pct = completionPct(project.doneTasks, project.totalTasks)
  const budgetPct = project.budgetMinutes
    ? Math.min(100, Math.round((project.minutes / project.budgetMinutes) * 100))
    : 0

  return (
    <Link
      href={`/projects/${project._id}`}
      className="group bg-card hover:border-primary/30 relative flex flex-col gap-3.5 overflow-hidden rounded-xl border p-4 pl-5 transition-all hover:shadow-md"
    >
      {/* Colour spine */}
      <span
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ backgroundColor: project.color ?? "#94a3b8" }}
        aria-hidden
      />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="group-hover:text-primary truncate font-semibold transition-colors">
            {project.name}
          </h3>
          <p className="text-muted-foreground mt-0.5 truncate text-xs">
            {[project.clientName, project.code].filter(Boolean).join(" · ") ||
              project.description ||
              "No description"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {project.status === "archived" && (
            <Badge variant="secondary" className="text-[10px]">
              Archived
            </Badge>
          )}
          <Badge variant="outline" className={cn("gap-1 text-[10px]", phase.badge)}>
            <span className="size-1.5 rounded-full" style={{ backgroundColor: phase.dot }} />
            {phase.label}
          </Badge>
        </div>
      </div>

      {/* Progress meter */}
      <div className="flex flex-col gap-1.5">
        <div className="text-muted-foreground flex items-center justify-between text-[11px]">
          <span className="flex items-center gap-1">
            <IconListCheck className="size-3.5" />
            {project.totalTasks > 0
              ? `${project.doneTasks} of ${project.totalTasks} tasks`
              : "No tasks yet"}
          </span>
          {project.totalTasks > 0 && (
            <span className="tabular-nums">{pct}%</span>
          )}
        </div>
        <div className="bg-muted h-1.5 overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Logged vs budget */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground flex items-center gap-1">
          <IconClock className="size-3.5" />
          <span className="text-foreground font-medium tabular-nums">
            {formatMinutes(project.minutes)}
          </span>
          {project.budgetMinutes > 0 && (
            <span className="text-muted-foreground tabular-nums">
              {" "}
              / {formatMinutes(project.budgetMinutes)}
            </span>
          )}
        </span>
        {project.overBudget ? (
          <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
            <IconAlertTriangle className="size-3.5" />
            Over budget
          </span>
        ) : project.openTasks > 0 ? (
          <span className="text-muted-foreground tabular-nums">
            {project.openTasks} open
          </span>
        ) : null}
      </div>

      {/* People involved */}
      <div className="flex items-center justify-between border-t pt-3">
        {project.people.length > 0 ? (
          <AssigneeAvatars people={project.people} max={5} />
        ) : (
          <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
            <IconUser className="size-3.5" />
            No one assigned
          </span>
        )}
        {project.leadName && (
          <span className="text-muted-foreground truncate text-[11px]">
            Lead · {project.leadName}
          </span>
        )}
      </div>
    </Link>
  )
}
