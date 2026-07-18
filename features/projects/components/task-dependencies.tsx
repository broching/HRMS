"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { IconPlus, IconX, IconArrowRight, IconBan } from "@tabler/icons-react"
import { toast } from "sonner"
import { getErrorMessage } from "@/lib/errors"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

type LinkRef = {
  linkId: Id<"taskLinks">
  taskId: Id<"projectTasks">
  name: string
  status: "open" | "done"
}

/**
 * Dependency editor for a task: the tasks blocking it (blocked-by) and the tasks
 * it blocks. Managers can add/remove edges; the backend guards against cycles.
 */
export function TaskDependencies({
  taskId,
  projectId,
  blockedBy,
  blocks,
  canManage,
}: {
  taskId: Id<"projectTasks">
  projectId: Id<"projects">
  blockedBy: LinkRef[]
  blocks: LinkRef[]
  canManage: boolean
}) {
  const link = useMutation(api.projects.linkTasks)
  const unlink = useMutation(api.projects.unlinkTasks)

  const usedIds = new Set<Id<"projectTasks">>([
    taskId,
    ...blockedBy.map((b) => b.taskId),
    ...blocks.map((b) => b.taskId),
  ])

  async function addBlockedBy(otherId: Id<"projectTasks">) {
    try {
      await link({ fromTaskId: otherId, toTaskId: taskId })
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't add the dependency."))
    }
  }
  async function addBlocks(otherId: Id<"projectTasks">) {
    try {
      await link({ fromTaskId: taskId, toTaskId: otherId })
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't add the dependency."))
    }
  }
  function removeLink(linkId: Id<"taskLinks">) {
    unlink({ linkId }).catch(() => toast.error("Couldn't remove the dependency."))
  }

  if (!canManage && blockedBy.length === 0 && blocks.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        Dependencies
      </Label>

      <DependencyGroup
        icon={<IconBan className="size-3.5" />}
        title="Blocked by"
        links={blockedBy}
        canManage={canManage}
        projectId={projectId}
        excludeIds={usedIds}
        onAdd={addBlockedBy}
        onRemove={removeLink}
        highlightOpen
      />
      <DependencyGroup
        icon={<IconArrowRight className="size-3.5" />}
        title="Blocks"
        links={blocks}
        canManage={canManage}
        projectId={projectId}
        excludeIds={usedIds}
        onAdd={addBlocks}
        onRemove={removeLink}
      />
    </div>
  )
}

function DependencyGroup({
  icon,
  title,
  links,
  canManage,
  projectId,
  excludeIds,
  onAdd,
  onRemove,
  highlightOpen,
}: {
  icon: React.ReactNode
  title: string
  links: LinkRef[]
  canManage: boolean
  projectId: Id<"projects">
  excludeIds: Set<Id<"projectTasks">>
  onAdd: (id: Id<"projectTasks">) => void
  onRemove: (id: Id<"taskLinks">) => void
  highlightOpen?: boolean
}) {
  if (links.length === 0 && !canManage) return null
  return (
    <div className="flex flex-col gap-1">
      <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
        {icon}
        {title}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {links.map((l) => (
          <span
            key={l.linkId}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs",
              highlightOpen && l.status === "open"
                ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "bg-muted/40",
              l.status === "done" && "text-muted-foreground line-through",
            )}
          >
            {l.name}
            {canManage && (
              <button
                type="button"
                onClick={() => onRemove(l.linkId)}
                className="hover:text-destructive"
                aria-label="Remove"
              >
                <IconX className="size-3" />
              </button>
            )}
          </span>
        ))}
        {canManage && (
          <TaskPickerButton
            projectId={projectId}
            excludeIds={excludeIds}
            onPick={onAdd}
          />
        )}
      </div>
    </div>
  )
}

function TaskPickerButton({
  projectId,
  excludeIds,
  onPick,
}: {
  projectId: Id<"projects">
  excludeIds: Set<Id<"projectTasks">>
  onPick: (id: Id<"projectTasks">) => void
}) {
  const board = useQuery(api.projects.board, { projectId })
  const [search, setSearch] = React.useState("")

  const options = (board?.tasks ?? []).filter(
    (t) =>
      !excludeIds.has(t._id) &&
      t.name.toLowerCase().includes(search.trim().toLowerCase()),
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-6 gap-1 px-1.5 text-xs">
          <IconPlus className="size-3.5" />
          Add
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60 p-1.5">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks…"
          className="mb-1 h-8"
        />
        <div className="max-h-52 overflow-y-auto">
          {options.length === 0 ? (
            <p className="text-muted-foreground px-2 py-3 text-center text-xs">
              No tasks.
            </p>
          ) : (
            options.map((t) => (
              <button
                key={t._id}
                type="button"
                onClick={() => onPick(t._id)}
                className="hover:bg-accent/60 flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
