"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { useOrganization } from "@clerk/nextjs"
import {
  IconBuilding,
  IconChevronDown,
  IconUsers,
  IconUser,
  IconPlus,
  IconMinus,
  IconFocusCentered,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { FunctionReturnType } from "convex/server"
import { useCurrentMember } from "@/hooks/use-current-member"
import { permitted } from "@/convex/lib/permissions"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { AddVacantDialog } from "./add-vacant-dialog"

type Node = FunctionReturnType<typeof api.employees.orgChart>[number]
type Highlight =
  | { kind: "dept"; key: Id<"departments"> }
  | { kind: "office"; key: string }
  | { kind: "vacant" }
  | null

type OrgModel = {
  children: Map<Id<"employees"> | "root", Node[]>
  deptColor: Map<Id<"departments">, string>
  descendants: Map<Id<"employees">, number>
  highlight: Highlight
}

const PALETTE = [
  "#22c55e",
  "#3b82f6",
  "#f97316",
  "#a855f7",
  "#14b8a6",
  "#eab308",
  "#ec4899",
  "#64748b",
]
const MIN_SCALE = 0.4
const MAX_SCALE = 2

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function matches(node: Node, h: Highlight): boolean {
  if (!h) return true
  if (h.kind === "dept") return node.departmentId === h.key
  if (h.kind === "office") return node.officeName === h.key
  return node.isVacant
}

export function OrgChart() {
  const nodes = useQuery(api.employees.orgChart)
  const departments = useQuery(api.departments.list) ?? []
  const offices = useQuery(api.offices.list) ?? []
  const { organization } = useOrganization()
  const member = useCurrentMember()
  const canManage = permitted(member?.permissions, "employees:manage")

  const [highlight, setHighlight] = React.useState<Highlight>(null)
  const [sidebarOpen, setSidebarOpen] = React.useState(true)
  const [addOpen, setAddOpen] = React.useState(false)

  // Pan/zoom transform.
  const [view, setView] = React.useState({ x: 0, y: 0, scale: 1 })
  const drag = React.useRef<{ x: number; y: number; vx: number; vy: number } | null>(
    null,
  )

  const built = React.useMemo(() => {
    if (!nodes) return null
    const byId = new Map<Id<"employees">, Node>(nodes.map((n) => [n._id, n]))
    const children = new Map<Id<"employees"> | "root", Node[]>()
    for (const n of nodes) {
      const key =
        n.managerId && byId.has(n.managerId) ? n.managerId : ("root" as const)
      const arr = children.get(key) ?? []
      arr.push(n)
      children.set(key, arr)
    }
    for (const arr of children.values()) arr.sort((a, b) => a.name.localeCompare(b.name))

    const deptIds = Array.from(
      new Set(nodes.map((n) => n.departmentId).filter(Boolean)),
    ) as Id<"departments">[]
    const deptColor = new Map<Id<"departments">, string>()
    deptIds.forEach((id, i) => deptColor.set(id, PALETTE[i % PALETTE.length]))

    const descendants = new Map<Id<"employees">, number>()
    const countOf = (id: Id<"employees">): number => {
      if (descendants.has(id)) return descendants.get(id)!
      const kids = children.get(id) ?? []
      const total = kids.reduce((s, k) => s + 1 + countOf(k._id), 0)
      descendants.set(id, total)
      return total
    }
    nodes.forEach((n) => countOf(n._id))
    return { children, deptColor, descendants }
  }, [nodes])

  function onPointerDown(e: React.PointerEvent) {
    // Only pan when grabbing empty canvas — let card links/buttons work.
    if ((e.target as HTMLElement).closest("[data-card]")) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    // Capture the pan origin now — the setView updater runs lazily at render
    // time, by which point a fast pointerup/leave may have nulled drag.current.
    const nx = d.vx + (e.clientX - d.x)
    const ny = d.vy + (e.clientY - d.y)
    setView((v) => ({ ...v, x: nx, y: ny }))
  }
  function endDrag() {
    drag.current = null
  }
  function zoom(delta: number) {
    setView((v) => ({
      ...v,
      scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, +(v.scale + delta).toFixed(2))),
    }))
  }
  function reset() {
    setView({ x: 0, y: 0, scale: 1 })
  }

  if (nodes === undefined || !built) {
    return <Skeleton className="mx-4 h-[28rem] rounded-xl lg:mx-6" />
  }
  if (nodes.length === 0) {
    return (
      <div className="px-4 lg:px-6">
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-20 text-center">
          <IconUsers className="text-muted-foreground size-10" stroke={1.5} />
          <p className="text-muted-foreground text-sm">No employees to chart yet.</p>
          {canManage && (
            <Button onClick={() => setAddOpen(true)}>
              <IconPlus className="size-4" />
              Add position
            </Button>
          )}
        </div>
        <AddVacantDialog open={addOpen} onOpenChange={setAddOpen} />
      </div>
    )
  }

  const model: OrgModel = { ...built, highlight }
  const roots = built.children.get("root") ?? []
  const companyName = organization?.name ?? "Organization"

  const deptCounts = new Map<string, number>()
  const officeCounts = new Map<string, number>()
  let vacantCount = 0
  for (const n of nodes) {
    if (n.departmentId) deptCounts.set(n.departmentId, (deptCounts.get(n.departmentId) ?? 0) + 1)
    if (n.officeName) officeCounts.set(n.officeName, (officeCounts.get(n.officeName) ?? 0) + 1)
    if (n.isVacant) vacantCount++
  }

  function toggle(h: Highlight) {
    setHighlight((cur) =>
      JSON.stringify(cur) === JSON.stringify(h) ? null : h,
    )
  }

  return (
    <div className="mx-4 flex h-[34rem] overflow-hidden rounded-xl border lg:mx-6">
      {/* Sidebar */}
      {sidebarOpen && (
        <aside className="bg-muted/30 w-60 shrink-0 overflow-y-auto border-r p-4 text-sm">
          <p className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
            Department
          </p>
          <ul className="flex flex-col gap-0.5">
            {departments.map((d) => (
              <li key={d._id}>
                <button
                  onClick={() => toggle({ kind: "dept", key: d._id })}
                  className={cn(
                    "hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left",
                    highlight?.kind === "dept" &&
                      highlight.key === d._id &&
                      "bg-accent font-medium",
                  )}
                >
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: built.deptColor.get(d._id) ?? "#94a3b8" }}
                  />
                  <span className="flex-1 truncate">{d.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {deptCounts.get(d._id) ?? 0}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <p className="text-muted-foreground mb-2 mt-4 text-xs font-semibold uppercase">
            Office
          </p>
          <ul className="flex flex-col gap-0.5">
            {offices.map((o) => (
              <li key={o._id}>
                <button
                  onClick={() => toggle({ kind: "office", key: o.name })}
                  className={cn(
                    "hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left",
                    highlight?.kind === "office" &&
                      highlight.key === o.name &&
                      "bg-accent font-medium",
                  )}
                >
                  <IconBuilding className="text-muted-foreground size-4" />
                  <span className="flex-1 truncate">{o.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {officeCounts.get(o.name) ?? 0}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <button
            onClick={() => toggle({ kind: "vacant" })}
            className={cn(
              "hover:bg-accent mt-4 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-medium",
              highlight?.kind === "vacant" && "bg-accent",
            )}
          >
            <span className="text-primary">Vacant positions ({vacantCount})</span>
          </button>
        </aside>
      )}

      {/* Canvas */}
      <div className="relative flex-1 overflow-hidden">
        {/* Toolbar */}
        <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSidebarOpen((s) => !s)}
          >
            {sidebarOpen ? (
              <IconLayoutSidebarLeftCollapse className="size-4" />
            ) : (
              <IconLayoutSidebarLeftExpand className="size-4" />
            )}
            {sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          </Button>
        </div>
        <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
          {canManage && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <IconPlus className="size-4" />
              Add
            </Button>
          )}
          <div className="bg-background flex items-center rounded-md border">
            <Button variant="ghost" size="icon" className="size-8" onClick={() => zoom(-0.2)}>
              <IconMinus className="size-4" />
            </Button>
            <span className="w-10 text-center text-xs tabular-nums">
              {Math.round(view.scale * 100)}%
            </span>
            <Button variant="ghost" size="icon" className="size-8" onClick={() => zoom(0.2)}>
              <IconPlus className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" className="size-8" onClick={reset}>
              <IconFocusCentered className="size-4" />
            </Button>
          </div>
        </div>

        {/* Pan/zoom viewport */}
        <div
          className="size-full cursor-grab touch-none select-none active:cursor-grabbing"
          style={{
            backgroundImage:
              "radial-gradient(var(--border) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
        >
          <div
            className="origin-top"
            style={{
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
              transition: drag.current ? "none" : "transform 0.1s",
            }}
          >
            <div className="flex min-w-max justify-center px-12 py-8">
              <ul className="org-tree">
                <li>
                  <Card className="flex items-center gap-2 rounded-md px-4 py-2.5 shadow-sm">
                    <IconBuilding className="text-muted-foreground size-4" />
                    <span className="text-sm font-semibold">{companyName}</span>
                  </Card>
                  {roots.length > 0 && (
                    <ul>
                      {roots.map((n) => (
                        <TreeNode key={n._id} node={n} model={model} />
                      ))}
                    </ul>
                  )}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <AddVacantDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  )
}

function TreeNode({ node, model }: { node: Node; model: OrgModel }) {
  const [collapsed, setCollapsed] = React.useState(false)
  const kids = model.children.get(node._id) ?? []
  const hasKids = kids.length > 0
  const color = node.departmentId ? model.deptColor.get(node.departmentId) : undefined
  const dimmed = !matches(node, model.highlight)

  return (
    <li>
      <Card
        data-card
        className={cn(
          "relative w-48 gap-0 p-3 shadow-sm transition-all hover:shadow-md",
          node.isVacant && "border-dashed",
          dimmed && "opacity-30",
        )}
      >
        {color && (
          <span
            className="absolute right-2 top-2 size-2 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden
          />
        )}
        <Link
          href={`/employees/${node._id}`}
          className="flex flex-col items-center gap-1.5 text-center"
        >
          {node.isVacant ? (
            <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
              <IconUser className="size-6" />
            </span>
          ) : (
            <Avatar className="size-12">
              <AvatarImage src={node.photoUrl ?? undefined} alt={node.name} />
              <AvatarFallback className="text-xs">{initials(node.name)}</AvatarFallback>
            </Avatar>
          )}
          {node.isVacant ? (
            <span className="text-primary text-sm font-semibold">VACANT</span>
          ) : (
            <span className="text-sm font-medium leading-tight hover:underline">
              {node.name}
            </span>
          )}
          <span className="text-muted-foreground line-clamp-1 text-xs">
            {node.positionTitle ?? "—"}
          </span>
        </Link>

        {hasKids && (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="bg-muted text-muted-foreground hover:bg-accent mx-auto mt-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
          >
            {collapsed ? <>+{model.descendants.get(node._id)}</> : <IconChevronDown className="size-3.5" />}
          </button>
        )}
      </Card>

      {hasKids && !collapsed && (
        <ul>
          {kids.map((k) => (
            <TreeNode key={k._id} node={k} model={model} />
          ))}
        </ul>
      )}
    </li>
  )
}
