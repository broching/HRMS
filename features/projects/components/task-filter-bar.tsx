"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import {
  IconFilter,
  IconX,
  IconTag,
  IconFlag,
  IconChevronDown,
  IconBookmark,
  IconTrash,
  IconDeviceFloppy,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { getErrorMessage } from "@/lib/errors"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { PRIORITY_OPTIONS } from "@/features/projects/lib/task"
import {
  type TaskFilter,
  emptyFilter,
  filterCount,
} from "@/features/projects/lib/task-filter"

const ANY = "__any__"

/**
 * Filter bar above the Board + List views. All controls mutate the client-side
 * `filter` applied to already-loaded board data. Saved views persist a filter
 * preset (personal, or shared by a manager).
 */
export function TaskFilterBar({
  projectId,
  filter,
  onChange,
  resultCount,
  canShare,
}: {
  projectId: Id<"projects">
  filter: TaskFilter
  onChange: (f: TaskFilter) => void
  resultCount: number
  canShare: boolean
}) {
  const employees = useQuery(api.employees.list, {})
  const labels = useQuery(api.labels.list, {})
  const fieldDefs = useQuery(api.taskFields.list, {})
  const views = useQuery(api.savedViews.list, { projectId })
  const saveView = useMutation(api.savedViews.save)
  const removeView = useMutation(api.savedViews.remove)

  const [saveOpen, setSaveOpen] = React.useState(false)
  const [viewName, setViewName] = React.useState("")
  const [shareView, setShareView] = React.useState(false)

  const count = filterCount(filter)
  const selectFields = (fieldDefs ?? []).filter(
    (d) => d.active && (d.type === "select" || d.type === "checkbox"),
  )

  function patch(p: Partial<TaskFilter>) {
    onChange({ ...filter, ...p })
  }
  function toggleLabel(id: Id<"taskLabels">) {
    patch({
      labelIds: filter.labelIds.includes(id)
        ? filter.labelIds.filter((x) => x !== id)
        : [...filter.labelIds, id],
    })
  }
  function togglePriority(p: "low" | "medium" | "high") {
    patch({
      priority: filter.priority.includes(p)
        ? filter.priority.filter((x) => x !== p)
        : [...filter.priority, p],
    })
  }

  async function doSaveView() {
    const name = viewName.trim()
    if (!name) return
    try {
      await saveView({
        name,
        filter: JSON.stringify(filter),
        projectId,
        isShared: shareView,
      })
      toast.success("View saved")
      setSaveOpen(false)
      setViewName("")
      setShareView(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save the view."))
    }
  }

  function applyView(filterJson: string) {
    try {
      const parsed = { ...emptyFilter(), ...JSON.parse(filterJson) } as TaskFilter
      onChange(parsed)
    } catch {
      toast.error("Couldn't load the view.")
    }
  }

  const nameFor = (id: Id<"employees">) => {
    const e = employees?.find((x) => x._id === id)
    return e ? `${e.preferredName ?? e.firstName} ${e.lastName}`.trim() : "—"
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <IconFilter className="text-muted-foreground size-4 shrink-0" />

      {/* Assignee */}
      <Select
        value={filter.assigneeId ?? ANY}
        onValueChange={(v) =>
          patch({ assigneeId: v === ANY ? null : (v as Id<"employees">) })
        }
      >
        <SelectTrigger size="sm" className="h-8 w-auto gap-1">
          <SelectValue placeholder="Assignee" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Anyone</SelectItem>
          {(employees ?? []).map((e) => (
            <SelectItem key={e._id} value={e._id}>
              {`${e.preferredName ?? e.firstName} ${e.lastName}`.trim()}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Priority */}
      <MultiDropdown
        icon={<IconFlag className="size-3.5" />}
        label="Priority"
        active={filter.priority.length}
      >
        {PRIORITY_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => togglePriority(o.value)}
            className="hover:bg-accent/60 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm"
          >
            <Checkbox checked={filter.priority.includes(o.value)} className="pointer-events-none" />
            {o.label}
          </button>
        ))}
      </MultiDropdown>

      {/* Labels */}
      <MultiDropdown
        icon={<IconTag className="size-3.5" />}
        label="Labels"
        active={filter.labelIds.length}
      >
        {(labels ?? []).length === 0 ? (
          <p className="text-muted-foreground px-2 py-2 text-center text-xs">No labels.</p>
        ) : (
          (labels ?? []).map((l) => (
            <button
              key={l._id}
              type="button"
              onClick={() => toggleLabel(l._id)}
              className="hover:bg-accent/60 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm"
            >
              <Checkbox checked={filter.labelIds.includes(l._id)} className="pointer-events-none" />
              <span className="size-2.5 rounded-full" style={{ backgroundColor: l.color }} />
              <span className="min-w-0 flex-1 truncate">{l.name}</span>
            </button>
          ))
        )}
      </MultiDropdown>

      {/* Due */}
      <Select
        value={filter.due ?? ANY}
        onValueChange={(v) => patch({ due: v === ANY ? null : (v as TaskFilter["due"]) })}
      >
        <SelectTrigger size="sm" className="h-8 w-auto gap-1">
          <SelectValue placeholder="Due" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any due</SelectItem>
          <SelectItem value="overdue">Overdue</SelectItem>
          <SelectItem value="soon">Due soon</SelectItem>
          <SelectItem value="none">No due date</SelectItem>
        </SelectContent>
      </Select>

      {/* Status */}
      <Select
        value={filter.status ?? ANY}
        onValueChange={(v) => patch({ status: v === ANY ? null : (v as "open" | "done") })}
      >
        <SelectTrigger size="sm" className="h-8 w-auto gap-1">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>Any status</SelectItem>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value="done">Done</SelectItem>
        </SelectContent>
      </Select>

      {/* Custom select/checkbox fields */}
      {selectFields.map((def) => (
        <Select
          key={def._id}
          value={filter.customFields[def.key] ?? ANY}
          onValueChange={(v) => {
            const next = { ...filter.customFields }
            if (v === ANY) delete next[def.key]
            else next[def.key] = v
            patch({ customFields: next })
          }}
        >
          <SelectTrigger size="sm" className="h-8 w-auto gap-1">
            <SelectValue placeholder={def.label} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{def.label}: any</SelectItem>
            {def.type === "checkbox" ? (
              <>
                <SelectItem value="true">Yes</SelectItem>
              </>
            ) : (
              (def.options ?? []).map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      ))}

      {count > 0 && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-8 gap-1"
            onClick={() => onChange(emptyFilter())}
          >
            <IconX className="size-3.5" />
            Clear
          </Button>
          <span className="text-muted-foreground text-xs tabular-nums">
            {resultCount} {resultCount === 1 ? "task" : "tasks"}
          </span>
        </>
      )}

      {/* Saved views */}
      <div className="ml-auto flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1">
              <IconBookmark className="size-3.5" />
              Views
              <IconChevronDown className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {(views ?? []).length === 0 ? (
              <p className="text-muted-foreground px-2 py-2 text-center text-xs">
                No saved views.
              </p>
            ) : (
              (views ?? []).map((v) => (
                <div key={v._id} className="flex items-center">
                  <button
                    type="button"
                    onClick={() => applyView(v.filter)}
                    className="hover:bg-accent/60 flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate">{v.name}</span>
                    {v.isShared && (
                      <span className="text-muted-foreground text-[10px]">Shared</span>
                    )}
                  </button>
                  {v.mine && (
                    <button
                      type="button"
                      onClick={() =>
                        removeView({ viewId: v._id }).catch(() =>
                          toast.error("Couldn't remove."),
                        )
                      }
                      className="text-muted-foreground hover:text-destructive px-1.5"
                      aria-label="Remove view"
                    >
                      <IconTrash className="size-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={count === 0}
              onSelect={(e) => {
                e.preventDefault()
                setSaveOpen(true)
              }}
            >
              <IconDeviceFloppy className="size-4" />
              Save current filter…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save view</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Name</Label>
              <Input
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                placeholder="e.g. My overdue tasks"
                autoFocus
              />
            </div>
            {canShare && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={shareView}
                  onCheckedChange={(v) => setShareView(v === true)}
                />
                Share with the whole team
              </label>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={doSaveView}>Save view</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MultiDropdown({
  icon,
  label,
  active,
  children,
}: {
  icon: React.ReactNode
  label: string
  active: number
  children: React.ReactNode
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 gap-1", active > 0 && "border-primary/50")}
        >
          {icon}
          {label}
          {active > 0 && (
            <span className="bg-primary text-primary-foreground ml-0.5 rounded-full px-1 text-[10px]">
              {active}
            </span>
          )}
          <IconChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52 p-1">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
