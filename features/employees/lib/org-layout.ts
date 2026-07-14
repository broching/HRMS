import type { Id } from "@/convex/_generated/dataModel"

/**
 * Default tidy-tree layout for the org chart. Produces absolute (x, y) canvas
 * coordinates for the synthetic company root + every employee node, used as the
 * fallback whenever a node has no saved position. Simple "leaves take sequential
 * slots, parents center over their children" algorithm — O(n), no sibling
 * overlap — which is plenty for org-sized trees.
 *
 * All coordinates are in canvas space (the same space saved positions live in),
 * with the origin at the top-left of the content.
 */

export type XY = { x: number; y: number }

// Card geometry — NODE_W matches the `w-48` card; NODE_H is an approximate fixed
// height used for connector anchoring and hit-testing.
export const NODE_W = 192
export const NODE_H = 132
export const H_GAP = 28
export const V_GAP = 60
export const ROW_H = NODE_H + V_GAP
const SLOT = NODE_W + H_GAP

type EmpId = Id<"employees">

export type OrgLayout = {
  positions: Map<EmpId, XY>
  /** Company root card position (not an employee, never dragged). */
  root: XY
  width: number
  height: number
}

export function computeTreeLayout(
  rootIds: EmpId[],
  getChildren: (id: EmpId) => EmpId[],
): OrgLayout {
  const positions = new Map<EmpId, XY>()
  const visited = new Set<EmpId>()
  let nextLeaf = 0

  // depth 0 = company root; employees begin at depth 1.
  function place(id: EmpId, depth: number): number {
    if (visited.has(id)) {
      // Defensive guard against a pre-existing managerId loop.
      return positions.get(id)?.x ?? 0
    }
    visited.add(id)
    const kids = getChildren(id)
    let x: number
    if (kids.length === 0) {
      x = nextLeaf * SLOT
      nextLeaf++
    } else {
      const xs = kids.map((k) => place(k, depth + 1))
      x = (xs[0] + xs[xs.length - 1]) / 2
    }
    positions.set(id, { x, y: depth * ROW_H })
    return x
  }

  const rootXs = rootIds.map((r) => place(r, 1))
  const rootX =
    rootXs.length > 0 ? (rootXs[0] + rootXs[rootXs.length - 1]) / 2 : 0
  const root: XY = { x: rootX, y: 0 }

  let maxX = rootX
  let maxY = 0
  for (const { x, y } of positions.values()) {
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { positions, root, width: maxX + NODE_W, height: maxY + NODE_H }
}
