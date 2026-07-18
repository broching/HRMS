"use client"

import { getErrorMessage } from "@/lib/errors"
import * as React from "react"
import { useRouter } from "next/navigation"
import { useQuery, useMutation } from "convex/react"
import {
  IconPlus,
  IconFolder,
  IconSearch,
  IconLayoutGrid,
  IconLayoutKanban,
  IconClock,
  IconChecklist,
  IconAlertTriangle,
  IconX,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import { permitted } from "@/convex/lib/permissions"
import { useCurrentMember } from "@/hooks/use-current-member"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import { formatMinutes } from "@/features/timesheets/lib/time"
import {
  PHASE_ORDER,
  PHASE_META,
  SORT_OPTIONS,
  completionPct,
  type SortKey,
  type ProjectPhase,
} from "@/features/projects/lib/portfolio"
import { ProjectDashboardCard } from "@/features/projects/components/project-dashboard-card"
import { ProjectPortfolioBoard } from "@/features/projects/components/project-portfolio-board"

type QuickFilter = "overBudget" | "openTasks" | "unassigned"

export function ProjectsManager() {
  const member = useCurrentMember()
  const canManageProjects = permitted(member?.permissions, "projects:manage")

  const projects = useQuery(api.projects.dashboard)

  const [view, setView] = React.useState<"cards" | "board">("cards")
  const [search, setSearch] = React.useState("")
  const [phase, setPhase] = React.useState<string>("all")
  const [lead, setLead] = React.useState<string>("all")
  const [sort, setSort] = React.useState<SortKey>("recent")
  const [quick, setQuick] = React.useState<QuickFilter[]>([])
  const [showArchived, setShowArchived] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)

  // Leads present across the portfolio, for the filter.
  const leads = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const p of projects ?? [])
      if (p.leadEmployeeId && p.leadName) m.set(p.leadEmployeeId, p.leadName)
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [projects])

  // Portfolio KPIs over the active set (unaffected by filters).
  const kpis = React.useMemo(() => {
    const active = (projects ?? []).filter((p) => p.status === "active")
    return {
      count: active.length,
      minutes: active.reduce((s, p) => s + p.minutes, 0),
      openTasks: active.reduce((s, p) => s + p.openTasks, 0),
      overBudget: active.filter((p) => p.overBudget).length,
    }
  }, [projects])

  const base = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return (projects ?? []).filter((p) => {
      if (q) {
        const hay = `${p.name} ${p.code ?? ""} ${p.clientName ?? ""} ${p.description ?? ""}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (phase !== "all" && p.phase !== phase) return false
      if (lead !== "all" && p.leadEmployeeId !== lead) return false
      if (quick.includes("overBudget") && !p.overBudget) return false
      if (quick.includes("openTasks") && p.openTasks === 0) return false
      if (quick.includes("unassigned") && p.people.length > 0) return false
      return true
    })
  }, [projects, search, phase, lead, quick])

  const cards = React.useMemo(() => {
    const list = base.filter((p) => (showArchived ? true : p.status === "active"))
    const sorted = [...list]
    sorted.sort((a, b) => {
      switch (sort) {
        case "name":
          return a.name.localeCompare(b.name)
        case "hours":
          return b.minutes - a.minutes
        case "progress":
          return (
            completionPct(b.doneTasks, b.totalTasks) -
            completionPct(a.doneTasks, a.totalTasks)
          )
        default:
          return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
      }
    })
    return sorted
  }, [base, showArchived, sort])

  const boardProjects = React.useMemo(
    () => base.filter((p) => p.status === "active"),
    [base],
  )

  const hasFilters =
    search.trim() !== "" || phase !== "all" || lead !== "all" || quick.length > 0

  function toggleQuick(f: QuickFilter) {
    setQuick((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]))
  }

  function clearFilters() {
    setSearch("")
    setPhase("all")
    setLead("all")
    setQuick([])
  }

  return (
    <div className="flex flex-col gap-5 px-4 py-6 lg:px-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="text-muted-foreground text-sm">
            Track progress, time, and who&apos;s working on what.
          </p>
        </div>
        {canManageProjects && (
          <Button onClick={() => setCreateOpen(true)}>
            <IconPlus className="size-4" />
            New project
          </Button>
        )}
      </div>

      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={IconFolder} label="Active projects" value={String(kpis.count)} />
        <Kpi icon={IconClock} label="Hours logged" value={formatMinutes(kpis.minutes)} />
        <Kpi icon={IconChecklist} label="Open tasks" value={String(kpis.openTasks)} />
        <Kpi
          icon={IconAlertTriangle}
          label="Over budget"
          value={String(kpis.overBudget)}
          tone={kpis.overBudget > 0 ? "danger" : "normal"}
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-xs flex-1">
            <IconSearch className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects…"
              className="pl-8"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={phase} onValueChange={setPhase}>
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue placeholder="Phase" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All phases</SelectItem>
                {PHASE_ORDER.map((ph) => (
                  <SelectItem key={ph} value={ph}>
                    {PHASE_META[ph].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {leads.length > 0 && (
              <Select value={lead} onValueChange={setLead}>
                <SelectTrigger className="h-9 w-[150px]">
                  <SelectValue placeholder="Lead" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any lead</SelectItem>
                  {leads.map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {view === "cards" && (
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger className="h-9 w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <ToggleGroup
              type="single"
              value={view}
              onValueChange={(v) => v && setView(v as "cards" | "board")}
              variant="outline"
              className="h-9"
            >
              <ToggleGroupItem value="cards" aria-label="Card view" className="px-2.5">
                <IconLayoutGrid className="size-4" />
              </ToggleGroupItem>
              <ToggleGroupItem value="board" aria-label="Board view" className="px-2.5">
                <IconLayoutKanban className="size-4" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>

        {/* Quick filter chips */}
        <div className="flex flex-wrap items-center gap-2">
          <Chip
            active={quick.includes("overBudget")}
            activeClass="border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400"
            onToggle={() => toggleQuick("overBudget")}
          >
            <IconAlertTriangle className="size-3.5" />
            Over budget
          </Chip>
          <Chip active={quick.includes("openTasks")} onToggle={() => toggleQuick("openTasks")}>
            Has open tasks
          </Chip>
          <Chip active={quick.includes("unassigned")} onToggle={() => toggleQuick("unassigned")}>
            Unassigned
          </Chip>
          {canManageProjects && view === "cards" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowArchived((s) => !s)}
            >
              {showArchived ? "Hide archived" : "Show archived"}
            </Button>
          )}
          {hasFilters && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={clearFilters}>
              <IconX className="size-3.5" />
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {projects === undefined ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 w-full rounded-xl" />
          ))}
        </div>
      ) : (projects.length === 0 || (view === "cards" && cards.length === 0) || (view === "board" && boardProjects.length === 0)) ? (
        <EmptyState
          hasProjects={projects.length > 0}
          filtered={hasFilters}
          canCreate={canManageProjects}
          onCreate={() => setCreateOpen(true)}
          onClear={clearFilters}
        />
      ) : view === "cards" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((p) => (
            <ProjectDashboardCard key={p._id} project={p} />
          ))}
        </div>
      ) : (
        <div className="-mx-4 lg:-mx-6">
          <ProjectPortfolioBoard projects={boardProjects} canManage={canManageProjects} />
        </div>
      )}

      {canManageProjects && (
        <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
      )}
    </div>
  )
}

function Chip({
  active,
  activeClass = "border-primary/40 bg-primary/10 text-primary",
  onToggle,
  children,
}: {
  active: boolean
  activeClass?: string
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={cn(
        "flex h-7 items-center gap-1 rounded-full border px-3 text-xs transition-colors",
        active ? activeClass : "text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </button>
  )
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone = "normal",
}: {
  icon: typeof IconFolder
  label: string
  value: string
  tone?: "normal" | "danger"
}) {
  return (
    <div className="bg-card flex items-center gap-3 rounded-xl border p-4">
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg",
          tone === "danger"
            ? "bg-red-500/10 text-red-600 dark:text-red-400"
            : "bg-primary/10 text-primary",
        )}
      >
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-semibold tabular-nums leading-none">{value}</p>
        <p className="text-muted-foreground mt-1 text-xs">{label}</p>
      </div>
    </div>
  )
}

function EmptyState({
  hasProjects,
  filtered,
  canCreate,
  onCreate,
  onClear,
}: {
  hasProjects: boolean
  filtered: boolean
  canCreate: boolean
  onCreate: () => void
  onClear: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-center">
      <IconFolder className="text-muted-foreground size-8" stroke={1.5} />
      <p className="text-muted-foreground text-sm">
        {hasProjects && filtered
          ? "No projects match your filters."
          : "No projects yet."}
      </p>
      {hasProjects && filtered ? (
        <Button variant="outline" size="sm" onClick={onClear}>
          Clear filters
        </Button>
      ) : (
        canCreate && (
          <Button onClick={onCreate}>
            <IconPlus className="size-4" />
            New project
          </Button>
        )
      )}
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
  const router = useRouter()
  const create = useMutation(api.projects.create)
  const [name, setName] = React.useState("")
  const [code, setCode] = React.useState("")
  const [clientName, setClientName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [color, setColor] = React.useState(COLORS[1])
  const [phase, setPhase] = React.useState<ProjectPhase>("planning")
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setName("")
      setCode("")
      setClientName("")
      setDescription("")
      setColor(COLORS[1])
      setPhase("planning")
    }
  }, [open])

  async function handleCreate() {
    if (!name.trim()) {
      toast.error("Give the project a name.")
      return
    }
    setSaving(true)
    try {
      const id = await create({
        name,
        code: code || undefined,
        clientName: clientName || undefined,
        description: description || undefined,
        color,
        phase,
      })
      toast.success("Project created")
      onOpenChange(false)
      router.push(`/projects/${id}`)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't create the project."))
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
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} />
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
          <div className="grid grid-cols-2 gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label className="text-xs">Phase</Label>
              <Select value={phase} onValueChange={(v) => setPhase(v as ProjectPhase)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PHASE_ORDER.map((ph) => (
                    <SelectItem key={ph} value={ph}>
                      {PHASE_META[ph].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Colour</Label>
              <div className="flex flex-wrap gap-2 pt-1.5">
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
          <Button onClick={handleCreate} disabled={saving}>
            {saving ? "Creating…" : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

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
