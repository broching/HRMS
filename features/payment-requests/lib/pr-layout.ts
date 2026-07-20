import type { PaymentRequestBlockType } from "@/convex/lib/enums"
import { GRID_COLS } from "@/features/payroll/lib/payslip-layout"

// The payment-request document's drag/resize block layout — the section-level
// mirror of the payslip builder. Geometry (`x/y/w/h`) is on the shared 12-column
// grid; heights are grid rows. See `features/payroll/lib/payslip-layout.ts` for
// the grid constants (GRID_COLS / ROW_PX) reused across both builders.
export type PrLayoutBlock = {
  id: string
  type: PaymentRequestBlockType
  visible: boolean
  text?: string
  heading?: boolean
  align?: "left" | "center" | "right"
  x?: number
  y?: number
  w?: number
  h?: number
}

// Order the classic (pre-grid) document renders in, top to bottom.
export const PR_BLOCK_ORDER: PaymentRequestBlockType[] = [
  "logo",
  "heading",
  "details",
  "attachNote",
  "signatures",
  "footer",
]

export const PR_BLOCK_META: Record<
  PaymentRequestBlockType,
  { label: string; hint: string; structural: boolean }
> = {
  logo: { label: "Company logo", hint: "The organization logo", structural: true },
  heading: { label: "Heading", hint: "The document title (e.g. Request for Payment)", structural: true },
  details: { label: "Request details", hint: "Date, requestor, purpose, amount/items, payee & custom fields", structural: true },
  attachNote: { label: "Attach note", hint: "“Please attach supporting document…”", structural: true },
  signatures: { label: "Signatures", hint: "Requestor & approver signature blocks", structural: true },
  footer: { label: "Footer", hint: "Reference number & organization name", structural: true },
  customText: { label: "Custom text", hint: "Your own text block", structural: false },
  divider: { label: "Divider", hint: "Horizontal rule", structural: false },
  spacer: { label: "Spacer", hint: "Vertical gap", structural: false },
}

export const PR_ADDABLE_BLOCKS: PaymentRequestBlockType[] = [
  "customText",
  "divider",
  "spacer",
]

// Starting heights (grid rows) for a block when it first gains geometry.
const PR_BLOCK_H: Record<PaymentRequestBlockType, number> = {
  logo: 8,
  heading: 5,
  details: 34,
  attachNote: 3,
  signatures: 20,
  footer: 3,
  customText: 4,
  divider: 2,
  spacer: 3,
}

export function prDefaultBlockHeight(type: PaymentRequestBlockType): number {
  return PR_BLOCK_H[type] ?? 5
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID()
  return `b_${Math.random().toString(36).slice(2)}`
}

export function prMakeBlock(type: PaymentRequestBlockType): PrLayoutBlock {
  return {
    id: newId(),
    type,
    visible: true,
    ...(type === "customText"
      ? { text: "Your text here", align: "left" as const }
      : {}),
  }
}

function hasGeometry(b: PrLayoutBlock): boolean {
  return (
    b.x !== undefined &&
    b.y !== undefined &&
    b.w !== undefined &&
    b.h !== undefined
  )
}

export function prNextRow(layout: PrLayoutBlock[]): number {
  let max = 0
  for (const b of layout) max = Math.max(max, (b.y ?? 0) + (b.h ?? 0))
  return max
}

// Back-fill grid geometry: fully legacy layouts stack full-width in order;
// partially-positioned layouts only place the gaps (preserving saved positions).
export function prAssignGrid(layout: PrLayoutBlock[]): PrLayoutBlock[] {
  if (layout.length === 0) return layout
  const anyPositioned = layout.some(hasGeometry)
  let y = anyPositioned ? prNextRow(layout.filter(hasGeometry)) : 0
  return layout.map((b) => {
    if (anyPositioned && hasGeometry(b)) return b
    const h = prDefaultBlockHeight(b.type)
    const placed = { ...b, x: 0, y, w: GRID_COLS, h }
    y += h
    return placed
  })
}

export function prMakeDefaultLayout(): PrLayoutBlock[] {
  return prAssignGrid(
    PR_BLOCK_ORDER.map((type) => ({ id: newId(), type, visible: true })),
  )
}

// Ensure a stored layout still contains every structural block (older templates
// created before this feature get the full set), then back-fill geometry.
export function prNormalizeLayout(
  layout: PrLayoutBlock[] | null | undefined,
): PrLayoutBlock[] {
  if (!layout || layout.length === 0) return prMakeDefaultLayout()
  const present = new Set(layout.map((b) => b.type))
  const appended: PrLayoutBlock[] = []
  for (const type of PR_BLOCK_ORDER) {
    if (PR_BLOCK_META[type].structural && !present.has(type)) {
      appended.push({ id: newId(), type, visible: true })
    }
  }
  return prAssignGrid([...layout, ...appended])
}
