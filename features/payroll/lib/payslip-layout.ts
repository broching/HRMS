import type { PayslipBlockType, PayslipDensity } from "@/convex/lib/enums"

// A single block in the payslip builder's layout (mirrors the Convex
// `payslipLayoutBlock` validator).
export type LayoutBlock = {
  id: string
  type: PayslipBlockType
  visible: boolean
  text?: string
  heading?: boolean
  align?: "left" | "center" | "right"
}

// Structural blocks render fixed payslip content; decoration blocks are
// user-added. The default layout mirrors the original fixed payslip.
export const DEFAULT_BLOCK_ORDER: PayslipBlockType[] = [
  "logo",
  "companyName",
  "headerText",
  "payMeta",
  "employeeDetails",
  "earnings",
  "deductions",
  "employerContribs",
  "totals",
  "exchangeInfo",
  "cpfNote",
  "signatures",
  "footer",
]

export const BLOCK_META: Record<
  PayslipBlockType,
  { label: string; hint: string; structural: boolean }
> = {
  header: { label: "Company header", hint: "Logo, name & header text", structural: true },
  logo: { label: "Company logo", hint: "The uploaded logo image", structural: true },
  companyName: { label: "Company name", hint: "Your organization's name", structural: true },
  headerText: { label: "Header text", hint: "Optional text under the name", structural: true },
  payMeta: { label: "Payment details", hint: "Pay period & payment date", structural: true },
  employeeDetails: { label: "Employee details", hint: "Name, ID, department, CPF status", structural: true },
  earnings: { label: "Earnings", hint: "Basic pay, allowances, additions", structural: true },
  deductions: { label: "Deductions", hint: "CPF, funds, other deductions", structural: true },
  employerContribs: { label: "Employer contributions", hint: "Employer CPF, SDL, custom", structural: true },
  totals: { label: "Totals", hint: "Gross & net pay", structural: true },
  exchangeInfo: { label: "Currency conversion", hint: "FX rate & base-currency amount (foreign pay only)", structural: true },
  cpfNote: { label: "CPF footnote", hint: "CPF-able wage note", structural: true },
  signatures: { label: "Signatures", hint: "Preparer & approver signatures", structural: true },
  footer: { label: "Footer", hint: "Footer text", structural: true },
  customText: { label: "Custom text", hint: "Your own text block", structural: false },
  divider: { label: "Divider", hint: "Horizontal rule", structural: false },
  spacer: { label: "Spacer", hint: "Vertical gap", structural: false },
}

// Blocks HR can add from the "Add block" menu.
export const ADDABLE_BLOCKS: PayslipBlockType[] = [
  "customText",
  "divider",
  "spacer",
]

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `b_${Math.random().toString(36).slice(2)}`
}

export function makeBlock(type: PayslipBlockType): LayoutBlock {
  return {
    id: newId(),
    type,
    visible: true,
    ...(type === "customText"
      ? { text: "Your text here", align: "left" as const }
      : {}),
  }
}

// The default block layout, all structural blocks visible in order.
export function makeDefaultLayout(): LayoutBlock[] {
  return DEFAULT_BLOCK_ORDER.map((type) => ({
    id: newId(),
    type,
    visible: true,
  }))
}

// Ensure a stored layout still contains every structural block (older templates
// created before a block existed get it appended, hidden). Keeps the builder and
// renderer resilient to future block additions.
export function normalizeLayout(layout: LayoutBlock[] | null | undefined): LayoutBlock[] {
  if (!layout || layout.length === 0) return makeDefaultLayout()
  // Migrate the legacy combined "header" block into separate logo / company name
  // / header-text blocks (in place), inheriting its visibility.
  const expanded: LayoutBlock[] = []
  for (const b of layout) {
    if (b.type === "header") {
      for (const type of ["logo", "companyName", "headerText"] as const) {
        expanded.push({ id: newId(), type, visible: b.visible })
      }
    } else {
      expanded.push(b)
    }
  }
  const present = new Set(expanded.map((b) => b.type))
  const appended: LayoutBlock[] = []
  for (const type of DEFAULT_BLOCK_ORDER) {
    if (BLOCK_META[type].structural && !present.has(type)) {
      appended.push({ id: newId(), type, visible: false })
    }
  }
  return [...expanded, ...appended]
}

// Expanded, print-safe font stacks (no external fonts — CSP/print friendly).
export const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: "System sans", value: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Helvetica", value: "Helvetica, Arial, sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Tahoma", value: "Tahoma, Geneva, sans-serif" },
  { label: "Trebuchet MS", value: '"Trebuchet MS", Tahoma, sans-serif' },
  { label: "Calibri", value: "Calibri, Candara, Segoe, sans-serif" },
  { label: "Georgia", value: 'Georgia, Cambria, "Times New Roman", serif' },
  { label: "Times New Roman", value: '"Times New Roman", Times, serif' },
  { label: "Palatino", value: '"Palatino Linotype", "Book Antiqua", Palatino, serif' },
  { label: "Garamond", value: 'Garamond, "Times New Roman", serif' },
  { label: "Courier", value: '"Courier New", Courier, monospace' },
  { label: "System mono", value: "ui-monospace, SFMono-Regular, Menlo, monospace" },
]

export const DENSITY_OPTIONS: { label: string; value: PayslipDensity }[] = [
  { label: "Compact", value: "compact" },
  { label: "Normal", value: "normal" },
  { label: "Relaxed", value: "relaxed" },
]

// Vertical gap (in rem) between blocks for each density.
export const DENSITY_GAP_REM: Record<PayslipDensity, number> = {
  compact: 1,
  normal: 1.75,
  relaxed: 2.75,
}
