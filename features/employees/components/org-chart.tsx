"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useQuery, useMutation } from "convex/react"
import { useOrganization } from "@clerk/nextjs"
import { ConvexError } from "convex/values"
import { toast } from "sonner"
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
  IconMaximize,
  IconMinimize,
  IconLayoutGrid,
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
import { OrgQuickEditDialog } from "./org-quick-edit-dialog"
import {
  computeTreeLayout,
  NODE_W,
  NODE_H,
  ROW_H,
  type XY,
} from "../lib/org-layout"

type Node = FunctionReturnType<typeof api.employees.orgChart>[number]
type EmpId = Id<"employees">
type Highlight =
  | { kind: "dept"; key: Id<"departments"> }
  | { kind: "office"; key: string }
  | { kind: "vacant" }
  | null

type Built = {
  byId: Map<EmpId, Node>
  children: Map<EmpId | "root", Node[]>
  deptColor: Map<Id<"departments">, string>
  descendants: Map<EmpId, number>
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
const MIN_SCALE = 0.3
const MAX_SCALE = 2
const DRAG_THRESHOLD = 4 // px of movement before a pointer-down becomes a drag
const FIT_PADDING = 48

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
  const saved = useQuery(api.employees.layoutPositions)
  const departments = useQuery(api.departments.list) ?? []
  const offices = useQuery(api.offices.list) ?? []
  const positions = useQuery(api.positions.list) ?? []
  const { organization } = useOrganization()
  const member = useCurrentMember()
  const router = useRouter()
  // Creating/archiving real employees stays employees:manage-only.
  const canManageEmployees = permitted(member?.permissions, "employees:manage")
  // Reassigning managers + editing cards from the chart: either the broad
  // employees:manage permission or the narrower, chart-specific one. Everyone
  // else can still drag cards to arrange their own personal view for free.
  const canEditChart =
    canManageEmployees || permitted(member?.permissions, "employees:org_chart")

  const saveLayout = useMutation(api.employees.saveLayoutPositions)
  const resetLayoutM = useMutation(api.employees.resetLayout)
  const setManager = useMutation(api.employees.setManager)

  const [highlight, setHighlight] = React.useState<Highlight>(null)
  // The filter rail starts closed and opens on desktop after mount (matching
  // the media query on the client avoids an SSR hydration mismatch). On phones
  // it renders as an overlay drawer so the canvas keeps the full width.
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  React.useEffect(() => {
    if (window.matchMedia("(min-width: 768px)").matches) setSidebarOpen(true)
  }, [])
  const [addOpen, setAddOpen] = React.useState(false)
  const [collapsed, setCollapsed] = React.useState<Set<EmpId>>(new Set())

  // Pan/zoom transform.
  const [view, setView] = React.useState({ x: 0, y: 0, scale: 1 })
  const pan = React.useRef<{ x: number; y: number; vx: number; vy: number } | null>(
    null,
  )

  // Positions the user has set this session (optimistic overlay over `saved`).
  const [localPos, setLocalPos] = React.useState<Map<EmpId, XY>>(new Map())
  // Live positions while a subtree is being dragged (not yet committed).
  const [dragMap, setDragMap] = React.useState<Map<EmpId, XY> | null>(null)
  const dragRef = React.useRef<{
    nodeId: EmpId
    subtree: EmpId[]
    startX: number
    startY: number
    base: Map<EmpId, XY>
    moved: boolean
  } | null>(null)

  // Pending reporting-line reassignment awaiting confirmation.
  const [reassign, setReassign] = React.useState<{
    employeeId: EmpId
    targetId: EmpId
  } | null>(null)

  // Live drag feedback: which node is being dragged + the node currently under
  // it (a candidate new manager). Cleared on drop.
  const [draggingId, setDraggingId] = React.useState<EmpId | null>(null)
  const [hoverTarget, setHoverTarget] = React.useState<EmpId | null>(null)

  // Card quick-edit modal (position / department / office / manager).
  const [quickEdit, setQuickEdit] = React.useState<Node | null>(null)

  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const viewportRef = React.useRef<HTMLDivElement>(null)
  const didFit = React.useRef(false)

  const built = React.useMemo<Built | null>(() => {
    if (!nodes) return null
    const byId = new Map<EmpId, Node>(nodes.map((n) => [n._id, n]))
    const children = new Map<EmpId | "root", Node[]>()
    for (const n of nodes) {
      const key =
        n.managerId && byId.has(n.managerId) ? n.managerId : ("root" as const)
      const arr = children.get(key) ?? []
      arr.push(n)
      children.set(key, arr)
    }
    for (const arr of children.values())
      arr.sort((a, b) => a.name.localeCompare(b.name))

    const deptIds = Array.from(
      new Set(nodes.map((n) => n.departmentId).filter(Boolean)),
    ) as Id<"departments">[]
    const deptColor = new Map<Id<"departments">, string>()
    deptIds.forEach((id, i) => deptColor.set(id, PALETTE[i % PALETTE.length]))

    const descendants = new Map<EmpId, number>()
    const countOf = (id: EmpId): number => {
      if (descendants.has(id)) return descendants.get(id)!
      const kids = children.get(id) ?? []
      const total = kids.reduce((s, k) => s + 1 + countOf(k._id), 0)
      descendants.set(id, total)
      return total
    }
    nodes.forEach((n) => countOf(n._id))
    return { byId, children, deptColor, descendants }
  }, [nodes])

  // Default tidy-tree layout (fallback for un-positioned nodes).
  const layout = React.useMemo(() => {
    if (!built) return null
    const roots = (built.children.get("root") ?? []).map((n) => n._id)
    return computeTreeLayout(roots, (id) =>
      (built.children.get(id) ?? []).map((n) => n._id),
    )
  }, [built])

  // Effective committed position map: default < saved < localPos.
  const basePositions = React.useMemo(() => {
    const m = new Map<EmpId, XY>()
    if (layout) for (const [id, xy] of layout.positions) m.set(id, xy)
    if (saved) for (const s of saved) m.set(s.employeeId, { x: s.x, y: s.y })
    for (const [id, xy] of localPos) m.set(id, xy)
    return m
  }, [layout, saved, localPos])

  const posOf = React.useCallback(
    (id: EmpId): XY =>
      dragMap?.get(id) ?? basePositions.get(id) ?? { x: 0, y: 0 },
    [dragMap, basePositions],
  )

  // Hidden nodes: everything under a collapsed node.
  const hidden = React.useMemo(() => {
    const set = new Set<EmpId>()
    if (!built) return set
    const hide = (id: EmpId) => {
      for (const k of built.children.get(id) ?? []) {
        set.add(k._id)
        hide(k._id)
      }
    }
    for (const id of collapsed) hide(id)
    return set
  }, [built, collapsed])

  const collectSubtree = React.useCallback(
    (id: EmpId): EmpId[] => {
      if (!built) return [id]
      const out: EmpId[] = []
      const walk = (nid: EmpId) => {
        out.push(nid)
        for (const k of built.children.get(nid) ?? []) walk(k._id)
      }
      walk(id)
      return out
    },
    [built],
  )

  // Fit all nodes into the viewport (used for recenter + first render).
  const fitToContent = React.useCallback(() => {
    if (!layout || !viewportRef.current) return
    const vp = viewportRef.current.getBoundingClientRect()
    let minX = layout.root.x
    let minY = layout.root.y
    let maxX = layout.root.x + NODE_W
    let maxY = layout.root.y + NODE_H
    for (const id of basePositions.keys()) {
      if (hidden.has(id)) continue
      const p = basePositions.get(id)!
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x + NODE_W)
      maxY = Math.max(maxY, p.y + NODE_H)
    }
    const cw = maxX - minX
    const ch = maxY - minY
    const scale = Math.min(
      MAX_SCALE,
      Math.max(
        MIN_SCALE,
        Math.min(
          (vp.width - 2 * FIT_PADDING) / cw,
          (vp.height - 2 * FIT_PADDING) / ch,
        ),
      ),
    )
    setView({
      scale,
      x: (vp.width - cw * scale) / 2 - minX * scale,
      y: (vp.height - ch * scale) / 2 - minY * scale,
    })
  }, [layout, basePositions, hidden])

  // Auto-fit once, on first data load.
  React.useEffect(() => {
    if (didFit.current || !layout || !viewportRef.current) return
    didFit.current = true
    fitToContent()
  }, [layout, fitToContent])

  // Track fullscreen state.
  React.useEffect(() => {
    const onChange = () =>
      setIsFullscreen(document.fullscreenElement === containerRef.current)
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void containerRef.current?.requestFullscreen()
    }
  }

  // ─── Canvas pan (empty space only) + two-finger pinch zoom ─────────────
  const pointers = React.useRef(new Map<number, { x: number; y: number }>())
  const pinch = React.useRef<{
    dist: number
    scale: number
    // Canvas-space point under the pinch midpoint at pinch start.
    canvasX: number
    canvasY: number
  } | null>(null)

  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("[data-card]")) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      // Second finger: switch from panning to pinching.
      pan.current = null
      const [a, b] = [...pointers.current.values()]
      const rect = viewportRef.current!.getBoundingClientRect()
      const midX = (a.x + b.x) / 2 - rect.left
      const midY = (a.y + b.y) / 2 - rect.top
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        scale: view.scale,
        canvasX: (midX - view.x) / view.scale,
        canvasY: (midY - view.y) / view.scale,
      }
      return
    }
    pan.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }
    const pz = pinch.current
    if (pz && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const rect = viewportRef.current!.getBoundingClientRect()
      const midX = (a.x + b.x) / 2 - rect.left
      const midY = (a.y + b.y) / 2 - rect.top
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const scale = Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, pz.scale * (dist / pz.dist)),
      )
      // Keep the canvas point that started under the fingers pinned to them.
      setView({
        scale,
        x: midX - pz.canvasX * scale,
        y: midY - pz.canvasY * scale,
      })
      return
    }
    const d = pan.current
    if (!d) return
    const nx = d.vx + (e.clientX - d.x)
    const ny = d.vy + (e.clientY - d.y)
    setView((v) => ({ ...v, x: nx, y: ny }))
  }
  function endPan(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
    if (pointers.current.size === 0) pan.current = null
  }
  function zoom(delta: number) {
    setView((v) => ({
      ...v,
      scale: Math.min(MAX_SCALE, Math.max(MIN_SCALE, +(v.scale + delta).toFixed(2))),
    }))
  }

  // ─── Node drag + click-to-open ───────────────────────────────────────────
  // Repositioning a card is a free, per-user display preference open to
  // everyone (saved via saveLayoutPositions, scoped to the caller). Dragging a
  // whole subtree and dropping onto another card to reassign a reporting line
  // is gated on canEditChart.
  function onCardPointerDown(e: React.PointerEvent, node: Node) {
    e.stopPropagation() // don't start a canvas pan
    const subtree = canEditChart ? collectSubtree(node._id) : [node._id]
    const base = new Map<EmpId, XY>()
    for (const id of subtree) base.set(id, posOf(id))
    dragRef.current = {
      nodeId: node._id,
      subtree,
      startX: e.clientX,
      startY: e.clientY,
      base,
      moved: false,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  function onCardPointerMove(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d) return
    if (
      !d.moved &&
      Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > DRAG_THRESHOLD
    ) {
      d.moved = true
      setDraggingId(d.nodeId)
    }
    if (!d.moved) return
    const dx = (e.clientX - d.startX) / view.scale
    const dy = (e.clientY - d.startY) / view.scale
    const m = new Map<EmpId, XY>()
    for (const id of d.subtree) {
      const b = d.base.get(id)!
      m.set(id, { x: b.x + dx, y: b.y + dy })
    }
    setDragMap(m)
    // Live: which node would become the new manager on drop? Only relevant
    // (and only computed) when the caller can actually reassign.
    if (canEditChart) {
      setHoverTarget(hitTest(d.nodeId, m.get(d.nodeId)!, new Set(d.subtree)))
    }
  }
  function onCardPointerUp(e: React.PointerEvent, node: Node) {
    const d = dragRef.current
    dragRef.current = null
    setDraggingId(null)
    setHoverTarget(null)
    if (!d) return
    if (!d.moved) {
      setDragMap(null)
      // A click (no drag): chart editors get the quick-edit modal; everyone
      // else opens the full profile.
      if (canEditChart) setQuickEdit(node)
      else router.push(`/employees/${node._id}`)
      return
    }
    const dx = (e.clientX - d.startX) / view.scale
    const dy = (e.clientY - d.startY) / view.scale
    const finals: { employeeId: EmpId; x: number; y: number }[] = []
    const next = new Map(localPos)
    for (const id of d.subtree) {
      const b = d.base.get(id)!
      const p = { x: b.x + dx, y: b.y + dy }
      next.set(id, p)
      finals.push({ employeeId: id, x: p.x, y: p.y })
    }
    setLocalPos(next)
    setDragMap(null)
    void saveLayout({ positions: finals }).catch(() =>
      toast.error("Couldn't save the layout."),
    )

    // Did we drop onto a valid new manager? Reassignment stays gated.
    if (canEditChart) {
      const dropped = next.get(node._id)!
      const target = hitTest(node._id, dropped, new Set(d.subtree))
      if (target) setReassign({ employeeId: node._id, targetId: target })
    }
  }

  // Best-overlap node under the dragged card, excluding self + descendants.
  function hitTest(
    nodeId: EmpId,
    dropped: XY,
    exclude: Set<EmpId>,
  ): EmpId | null {
    if (!built) return null
    let best: EmpId | null = null
    let bestArea = 0
    for (const n of built.byId.values()) {
      if (exclude.has(n._id) || hidden.has(n._id)) continue
      const p = posOf(n._id)
      const ix = Math.max(
        0,
        Math.min(dropped.x + NODE_W, p.x + NODE_W) - Math.max(dropped.x, p.x),
      )
      const iy = Math.max(
        0,
        Math.min(dropped.y + NODE_H, p.y + NODE_H) - Math.max(dropped.y, p.y),
      )
      const area = ix * iy
      if (area > bestArea) {
        bestArea = area
        best = n._id
      }
    }
    return best
  }

  async function confirmReassign() {
    if (!reassign || !built) return
    const { employeeId, targetId } = reassign
    setReassign(null)
    try {
      await setManager({ employeeId, managerId: targetId })
      // Tuck the reassigned subtree neatly below its new manager.
      const target = posOf(targetId)
      const cur = posOf(employeeId)
      const dx = target.x - cur.x
      const dy = target.y + ROW_H - cur.y
      const finals: { employeeId: EmpId; x: number; y: number }[] = []
      const next = new Map(localPos)
      for (const id of collectSubtree(employeeId)) {
        const b = posOf(id)
        const p = { x: b.x + dx, y: b.y + dy }
        next.set(id, p)
        finals.push({ employeeId: id, x: p.x, y: p.y })
      }
      setLocalPos(next)
      void saveLayout({ positions: finals })
      const name = built.byId.get(targetId)?.name ?? "manager"
      toast.success(`Now reporting to ${name}.`)
    } catch (err) {
      const message =
        err instanceof ConvexError
          ? (err.data as { message?: string })?.message
          : undefined
      toast.error(message ?? "Couldn't change the reporting line.")
    }
  }

  async function autoArrange() {
    setLocalPos(new Map())
    try {
      await resetLayoutM({})
      didFit.current = false
      setTimeout(fitToContent, 0)
    } catch {
      toast.error("Couldn't reset the layout.")
    }
  }

  if (nodes === undefined || saved === undefined || !built || !layout) {
    return <Skeleton className="mx-4 h-[28rem] rounded-xl lg:mx-6" />
  }
  if (nodes.length === 0) {
    return (
      <div className="px-4 lg:px-6">
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-20 text-center">
          <IconUsers className="text-muted-foreground size-10" stroke={1.5} />
          <p className="text-muted-foreground text-sm">No employees to chart yet.</p>
          {canManageEmployees && (
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

  const roots = built.children.get("root") ?? []
  const companyName = organization?.name ?? "Organization"
  const visibleNodes = nodes.filter((n) => !hidden.has(n._id))

  // Content bounds for the connector SVG (absolute canvas coords).
  let minX = layout.root.x
  let minY = layout.root.y
  let maxX = layout.root.x + NODE_W
  let maxY = layout.root.y + NODE_H
  for (const n of visibleNodes) {
    const p = posOf(n._id)
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x + NODE_W)
    maxY = Math.max(maxY, p.y + NODE_H)
  }

  // Connector paths: parent-bottom-center → child-top-center elbows.
  const edges: string[] = []
  const edge = (a: XY, b: XY) => {
    const sx = a.x + NODE_W / 2
    const sy = a.y + NODE_H
    const tx = b.x + NODE_W / 2
    const ty = b.y
    const midY = (sy + ty) / 2
    return `M ${sx} ${sy} V ${midY} H ${tx} V ${ty}`
  }
  for (const n of roots) {
    if (!hidden.has(n._id)) edges.push(edge(layout.root, posOf(n._id)))
  }
  for (const n of visibleNodes) {
    if (!n.managerId || !built.byId.has(n.managerId)) continue
    if (hidden.has(n.managerId)) continue
    edges.push(edge(posOf(n.managerId), posOf(n._id)))
  }

  // Dotted connectors for additional (secondary) managers.
  const dottedEdges: string[] = []
  for (const n of visibleNodes) {
    for (const mId of n.additionalManagerIds) {
      if (!built.byId.has(mId) || hidden.has(mId)) continue
      dottedEdges.push(edge(posOf(mId), posOf(n._id)))
    }
  }

  const deptCounts = new Map<string, number>()
  const officeCounts = new Map<string, number>()
  let vacantCount = 0
  for (const n of nodes) {
    if (n.departmentId)
      deptCounts.set(n.departmentId, (deptCounts.get(n.departmentId) ?? 0) + 1)
    if (n.officeName)
      officeCounts.set(n.officeName, (officeCounts.get(n.officeName) ?? 0) + 1)
    if (n.isVacant) vacantCount++
  }

  function toggle(h: Highlight) {
    setHighlight((cur) => (JSON.stringify(cur) === JSON.stringify(h) ? null : h))
  }
  function toggleCollapse(id: EmpId) {
    setCollapsed((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const reassignTargetXY = reassign ? posOf(reassign.targetId) : null

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative mx-4 flex overflow-hidden rounded-xl border lg:mx-6",
        isFullscreen ? "bg-background h-screen w-screen rounded-none" : "h-[34rem]",
      )}
    >
      {/* Sidebar — inline rail on desktop, overlay drawer on phones */}
      {sidebarOpen && (
        <>
          <div
            className="absolute inset-0 z-20 bg-black/25 md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden
          />
          <aside className="bg-background absolute inset-y-0 left-0 z-30 w-64 shrink-0 overflow-y-auto border-r p-4 text-sm shadow-xl md:static md:z-auto md:w-60 md:bg-muted/30 md:shadow-none">
            <div className="mb-2 flex items-center justify-between md:hidden">
              <span className="text-sm font-semibold">Filters</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close filters"
              >
                <IconLayoutSidebarLeftCollapse className="size-4" />
              </Button>
            </div>
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

          <p className="text-muted-foreground mt-6 text-[11px] leading-relaxed">
            Drag any card to rearrange your view.
            {canEditChart &&
              " Drop a person onto another to change who they report to."}
          </p>
          </aside>
        </>
      )}

      {/* Canvas */}
      <div className="relative flex-1 overflow-hidden">
        {/* Toolbar (left) */}
        <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setSidebarOpen((s) => !s)}>
            {sidebarOpen ? (
              <IconLayoutSidebarLeftCollapse className="size-4" />
            ) : (
              <IconLayoutSidebarLeftExpand className="size-4" />
            )}
            <span className="hidden sm:inline">
              {sidebarOpen ? "Hide sidebar" : "Filters"}
            </span>
          </Button>
        </div>

        {/* Toolbar (right) */}
        <div className="absolute right-3 top-3 z-10 flex max-w-[calc(100%-4.5rem)] flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={autoArrange} title="Auto arrange">
            <IconLayoutGrid className="size-4" />
            <span className="hidden sm:inline">Auto arrange</span>
          </Button>
          {canManageEmployees && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <IconPlus className="size-4" />
              <span className="hidden sm:inline">Add</span>
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
            <Button variant="ghost" size="icon" className="size-8" onClick={fitToContent}>
              <IconFocusCentered className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? (
                <IconMinimize className="size-4" />
              ) : (
                <IconMaximize className="size-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Pan/zoom viewport */}
        <div
          ref={viewportRef}
          className="size-full cursor-grab touch-none select-none active:cursor-grabbing"
          style={{
            backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPan}
          onPointerLeave={endPan}
          onPointerCancel={endPan}
        >
          <div
            className="relative origin-top-left"
            style={{
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
              transition: pan.current || dragMap ? "none" : "transform 0.1s",
            }}
          >
            {/* Connectors */}
            <svg
              className="pointer-events-none absolute overflow-visible"
              style={{ left: minX, top: minY }}
              width={maxX - minX}
              height={maxY - minY}
              viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
            >
              {edges.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth={1.5}
                />
              ))}
              {/* Secondary (dotted-line) reporting relationships. */}
              {dottedEdges.map((d, i) => (
                <path
                  key={`dotted-${i}`}
                  d={d}
                  fill="none"
                  stroke="var(--muted-foreground)"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  opacity={0.6}
                />
              ))}
            </svg>

            {/* Company root */}
            <div
              className="absolute"
              style={{ left: layout.root.x, top: layout.root.y, width: NODE_W }}
            >
              <Card className="flex items-center justify-center gap-2 rounded-md px-4 py-2.5 shadow-sm">
                <IconBuilding className="text-muted-foreground size-4" />
                <span className="text-sm font-semibold">{companyName}</span>
              </Card>
            </div>

            {/* Nodes */}
            {visibleNodes.map((node) => {
              const p = posOf(node._id)
              const color = node.departmentId
                ? built.deptColor.get(node.departmentId)
                : undefined
              const dimmed = !matches(node, highlight)
              const kids = built.children.get(node._id) ?? []
              const hasKids = kids.length > 0
              const isCollapsed = collapsed.has(node._id)
              const isDragTarget = reassign?.targetId === node._id
              const isHoverTarget = draggingId !== null && hoverTarget === node._id
              const isDragging = draggingId === node._id
              return (
                <div
                  key={node._id}
                  data-card
                  className="absolute"
                  style={{
                    left: p.x,
                    top: p.y,
                    width: NODE_W,
                    zIndex: isDragging ? 30 : undefined,
                  }}
                  onPointerDown={(e) => onCardPointerDown(e, node)}
                  onPointerMove={onCardPointerMove}
                  onPointerUp={(e) => onCardPointerUp(e, node)}
                >
                  {/* Live drag feedback */}
                  {isHoverTarget && (
                    <span className="bg-primary text-primary-foreground absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap shadow">
                      New manager
                    </span>
                  )}
                  {isDragging && (
                    <span className="bg-foreground text-background absolute -top-2.5 left-1/2 z-10 -translate-x-1/2 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap shadow">
                      {hoverTarget
                        ? `Reports to ${built.byId.get(hoverTarget)?.name ?? "…"}`
                        : "Moving"}
                    </span>
                  )}
                  <Card
                    className={cn(
                      "relative w-48 gap-0 p-3 shadow-sm transition-shadow hover:shadow-md",
                      "cursor-grab active:cursor-grabbing",
                      node.isVacant && "border-dashed",
                      dimmed && "opacity-30",
                      isDragging && "shadow-xl",
                      (isDragTarget || isHoverTarget) &&
                        "ring-primary ring-2 ring-offset-1",
                    )}
                  >
                    {color && (
                      <span
                        className="absolute right-2 top-2 size-2 rounded-full"
                        style={{ backgroundColor: color }}
                        aria-hidden
                      />
                    )}
                    <div className="flex flex-col items-center gap-1.5 text-center">
                      {node.isVacant ? (
                        <span className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
                          <IconUser className="size-6" />
                        </span>
                      ) : (
                        <Avatar className="size-12">
                          <AvatarImage src={node.photoUrl ?? undefined} alt={node.name} />
                          <AvatarFallback className="text-xs">
                            {initials(node.name)}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      {node.isVacant ? (
                        <span className="text-primary text-sm font-semibold">VACANT</span>
                      ) : (
                        <span className="text-sm font-medium leading-tight">
                          {node.name}
                        </span>
                      )}
                      <span className="text-muted-foreground line-clamp-1 text-xs">
                        {node.positionTitle ?? "—"}
                      </span>
                    </div>

                    {hasKids && (
                      <button
                        type="button"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => toggleCollapse(node._id)}
                        className="bg-muted text-muted-foreground hover:bg-accent mx-auto mt-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                      >
                        {isCollapsed ? (
                          <>+{built.descendants.get(node._id)}</>
                        ) : (
                          <IconChevronDown className="size-3.5" />
                        )}
                      </button>
                    )}
                  </Card>
                </div>
              )
            })}
          </div>

          {/* Reassign confirmation popover (screen-space, tracks pan/zoom) */}
          {reassign && reassignTargetXY && (
            <div
              // Stop pointer events bubbling to the viewport — otherwise pressing
              // a button starts a canvas pan (pointer capture) and the click on
              // Confirm/Cancel never lands.
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              className="bg-popover text-popover-foreground absolute z-20 w-56 -translate-x-1/2 -translate-y-full rounded-lg border p-3 shadow-lg"
              style={{
                left: view.x + (reassignTargetXY.x + NODE_W / 2) * view.scale,
                top: view.y + (reassignTargetXY.y - 8) * view.scale,
              }}
            >
              <p className="text-sm">
                Make{" "}
                <span className="font-semibold">
                  {built.byId.get(reassign.employeeId)?.name}
                </span>{" "}
                report to{" "}
                <span className="font-semibold">
                  {built.byId.get(reassign.targetId)?.name}
                </span>
                ?
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setReassign(null)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={confirmReassign}>
                  Confirm
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <AddVacantDialog open={addOpen} onOpenChange={setAddOpen} />

      {quickEdit &&
        (() => {
          // Valid managers = everyone except the person and their own subtree
          // (prevents cycles; the server enforces this too).
          const sub = new Set(collectSubtree(quickEdit._id))
          const managerOptions = nodes
            .filter((n) => !sub.has(n._id))
            .map((n) => ({ id: n._id, label: n.name }))
          return (
            <OrgQuickEditDialog
              key={quickEdit._id}
              open
              onOpenChange={(o) => !o && setQuickEdit(null)}
              employeeId={quickEdit._id}
              employeeName={quickEdit.name}
              initial={{
                departmentId: quickEdit.departmentId,
                positionId: quickEdit.positionId,
                officeId: quickEdit.officeId,
                managerId: quickEdit.managerId,
                additionalManagerIds: quickEdit.additionalManagerIds,
              }}
              departments={departments.map((d) => ({ id: d._id, label: d.name }))}
              positions={positions.map((p) => ({ id: p._id, label: p.title }))}
              offices={offices.map((o) => ({ id: o._id, label: o.name }))}
              managerOptions={managerOptions}
            />
          )
        })()}
    </div>
  )
}
