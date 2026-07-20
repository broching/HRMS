"use client"

import * as React from "react"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { toast } from "sonner"
import {
  IconPlus,
  IconTrash,
  IconStar,
  IconUpload,
  IconArrowsMove,
  IconEye,
  IconEyeOff,
  IconPencil,
  IconLayoutGrid,
} from "@tabler/icons-react"
import ReactGridLayout, { WidthProvider, type Layout } from "react-grid-layout"
import "react-grid-layout/css/styles.css"
import "react-resizable/css/styles.css"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { PayslipBlockType, PayslipDensity } from "@/convex/lib/enums"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { getErrorMessage } from "@/lib/errors"
import { PayslipDocument } from "@/features/payroll/components/payslip-document"
import {
  ADDABLE_BLOCKS,
  BLOCK_META,
  DENSITY_OPTIONS,
  FONT_OPTIONS,
  GRID_COLS,
  ROW_PX,
  defaultBlockHeight,
  nextRow,
  makeBlock,
  makeDefaultLayout,
  normalizeLayout,
  type LayoutBlock,
} from "@/features/payroll/lib/payslip-layout"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const GridLayout = WidthProvider(ReactGridLayout)

type Template = FunctionReturnType<typeof api.payslipTemplates.list>[number]
type Payslip = FunctionReturnType<typeof api.payroll.getPayslip>
type Show = Template["show"]

type Form = {
  name: string
  accentColor: string
  textColor: string | null
  fontFamily: string
  fontScale: number
  density: PayslipDensity
  headerText: string
  footerText: string
  show: Show
  layout: LayoutBlock[]
}

function toForm(t: Template): Form {
  return {
    name: t.name,
    accentColor: t.accentColor,
    textColor: t.textColor ?? null,
    fontFamily: t.fontFamily,
    fontScale: t.fontScale ?? 1,
    density: t.density ?? "normal",
    headerText: t.headerText ?? "",
    footerText: t.footerText ?? "",
    show: t.show,
    layout: normalizeLayout((t.layout as LayoutBlock[] | null) ?? null),
  }
}

// Keep the legacy `show` toggles in sync with the block layout's visibility so
// older render paths / exports stay consistent.
function showFromLayout(layout: LayoutBlock[], base: Show): Show {
  const vis = (type: PayslipBlockType) =>
    layout.find((b) => b.type === type)?.visible ?? false
  return {
    ...base,
    employerContribs: vis("employerContribs"),
    cpfNote: vis("cpfNote"),
    signatures: vis("signatures"),
  }
}

// Build a sample payslip to preview a template's appearance.
function sampleSlip(form: Form, logoUrl: string | null): Payslip {
  const id = "" as unknown as Id<"payslips">
  return {
    _id: id,
    _creationTime: 0,
    employeeId: "" as unknown as Id<"employees">,
    employeeName: "Jane Tan",
    periodMonth: "2026-06",
    currency: "SGD",
    baseCents: 500000,
    allowancesCents: 20000,
    grossCents: 520000,
    cpfableWageCents: 500000,
    employeeCpfCents: 100000,
    employerCpfCents: 85000,
    netCents: 419000,
    cpfStatus: "citizen",
    prYear: null,
    baseCurrency: "SGD",
    exchangeRate: 1,
    exchangeRateDate: null,
    exchangeMode: null,
    exchangeProvider: null,
    lines: [
      { label: "Base pay", amountCents: 500000, type: "earning" },
      { label: "Transport", amountCents: 20000, type: "earning" },
      { label: "CPF (employee)", amountCents: 100000, type: "deduction" },
      { label: "CDAC", amountCents: 100, type: "deduction" },
      { label: "CPF (employer)", amountCents: 85000, type: "employer" },
      { label: "SDL", amountCents: 1125, type: "employer" },
    ],
    status: "paid",
    proration: null,
    template: {
      accentColor: form.accentColor,
      textColor: form.textColor,
      fontFamily: form.fontFamily,
      fontScale: form.fontScale,
      density: form.density,
      logoUrl,
      headerText: form.headerText || null,
      footerText: form.footerText || null,
      show: form.show,
      layout: form.layout,
    },
    signatures: [
      { role: "Prepared by", name: "Alex Lim", url: null, signedAt: 0 },
    ],
    companyName: "Acme Pte Ltd",
    employeeNumber: "E001",
    departmentName: "Engineering",
    positionTitle: "Software Engineer",
    payPeriodStart: "2026-06-01",
    payPeriodEnd: "2026-06-30",
    payDate: "2026-06-28",
  }
}

// ─── Block builder (drag + resize canvas) ───────────────────────────────────

// One tile on the layout canvas. The whole header is the drag handle; the body
// carries per-block controls. react-grid-layout owns position + size.
function BlockTile({
  block,
  onPatch,
  onRemove,
  onEditText,
}: {
  block: LayoutBlock
  onPatch: (p: Partial<LayoutBlock>) => void
  onRemove: (() => void) | null
  onEditText: (() => void) | null
}) {
  const meta = BLOCK_META[block.type]
  return (
    <div
      className={cn(
        "bg-background flex h-full flex-col overflow-hidden rounded-md border",
        !block.visible && "opacity-50",
      )}
    >
      <div className="block-drag flex cursor-move items-center gap-1.5 border-b px-2 py-1.5">
        <IconArrowsMove className="text-muted-foreground/60 size-3.5 shrink-0" />
        <span className="truncate text-xs font-medium">{meta.label}</span>
        {!meta.structural && (
          <Badge variant="secondary" className="shrink-0 text-[9px]">
            custom
          </Badge>
        )}
        <div className="ml-auto flex shrink-0 items-center">
          {onEditText && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-6"
              aria-label="Edit text"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={onEditText}
            >
              <IconPencil className="size-3.5" />
            </Button>
          )}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-6"
            aria-label={block.visible ? "Hide block" : "Show block"}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => onPatch({ visible: !block.visible })}
          >
            {block.visible ? (
              <IconEye className="size-3.5" />
            ) : (
              <IconEyeOff className="text-muted-foreground size-3.5" />
            )}
          </Button>
          {onRemove && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="text-destructive size-6"
              aria-label="Remove block"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={onRemove}
            >
              <IconTrash className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
      <div className="text-muted-foreground min-h-0 flex-1 px-2 py-1 text-[11px]">
        {block.type === "customText" ? (
          <p className="line-clamp-3 italic">
            {block.text?.trim() || "Empty text — click the pencil to edit."}
          </p>
        ) : (
          <p className="line-clamp-2">{meta.hint}</p>
        )}
      </div>
    </div>
  )
}

function BlockBuilder({
  layout,
  onChange,
}: {
  layout: LayoutBlock[]
  onChange: (next: LayoutBlock[]) => void
}) {
  const [editId, setEditId] = React.useState<string | null>(null)
  const editing = layout.find((b) => b.id === editId) ?? null

  const rglLayout: Layout[] = layout.map((b) => ({
    i: b.id,
    x: b.x ?? 0,
    y: b.y ?? 0,
    w: b.w ?? GRID_COLS,
    h: b.h ?? defaultBlockHeight(b.type),
    minW: 2,
    minH: 2,
  }))

  function onLayoutChange(next: Layout[]) {
    const map = new Map(next.map((l) => [l.i, l]))
    let changed = false
    const merged = layout.map((b) => {
      const l = map.get(b.id)
      if (!l) return b
      if (b.x !== l.x || b.y !== l.y || b.w !== l.w || b.h !== l.h) {
        changed = true
        return { ...b, x: l.x, y: l.y, w: l.w, h: l.h }
      }
      return b
    })
    if (changed) onChange(merged)
  }
  function patch(id: string, p: Partial<LayoutBlock>) {
    onChange(layout.map((b) => (b.id === id ? { ...b, ...p } : b)))
  }
  function remove(id: string) {
    onChange(layout.filter((b) => b.id !== id))
  }
  function add(type: PayslipBlockType) {
    const b = makeBlock(type)
    onChange([
      ...layout,
      {
        ...b,
        x: 0,
        y: nextRow(layout),
        w: GRID_COLS,
        h: defaultBlockHeight(type),
      },
    ])
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5">
          <IconLayoutGrid className="size-4" />
          Layout
        </Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <IconPlus className="size-4" />
              Add block
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {ADDABLE_BLOCKS.map((t) => (
              <DropdownMenuItem key={t} onClick={() => add(t)}>
                {BLOCK_META[t].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="text-muted-foreground text-xs">
        Drag a block by its header to move it, and drag its bottom-right corner
        to resize. Position, width and height carry through to the printed
        payslip.
      </p>

      <div className="bg-muted/30 rounded-lg border p-2">
        <GridLayout
          className="payslip-layout-grid"
          layout={rglLayout}
          cols={GRID_COLS}
          rowHeight={ROW_PX}
          margin={[8, 8]}
          isBounded
          draggableHandle=".block-drag"
          onLayoutChange={onLayoutChange}
          compactType="vertical"
        >
          {layout.map((b) => (
            <div key={b.id}>
              <BlockTile
                block={b}
                onPatch={(p) => patch(b.id, p)}
                onRemove={
                  BLOCK_META[b.type].structural ? null : () => remove(b.id)
                }
                onEditText={
                  b.type === "customText" ? () => setEditId(b.id) : null
                }
              />
            </div>
          ))}
        </GridLayout>
      </div>

      <Dialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditId(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit text block</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="flex flex-col gap-3">
              <Textarea
                value={editing.text ?? ""}
                onChange={(e) => patch(editing.id, { text: e.target.value })}
                placeholder="Text to show on the payslip…"
                rows={4}
                autoFocus
              />
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={editing.heading ?? false}
                    onCheckedChange={(c) => patch(editing.id, { heading: c })}
                  />
                  Heading style
                </label>
                <Select
                  value={editing.align ?? "left"}
                  onValueChange={(v) =>
                    patch(editing.id, {
                      align: v as "left" | "center" | "right",
                    })
                  }
                >
                  <SelectTrigger className="h-8 w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Left</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                    <SelectItem value="right">Right</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => setEditId(null)}>Done</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Settings page ──────────────────────────────────────────────────────────

export function PayslipTemplatesSettings() {
  const templates = useQuery(api.payslipTemplates.list)
  const create = useMutation(api.payslipTemplates.create)
  const update = useMutation(api.payslipTemplates.update)
  const remove = useMutation(api.payslipTemplates.remove)
  const getLogoUrl = useMutation(api.payslipTemplates.generateLogoUploadUrl)

  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [form, setForm] = React.useState<Form | null>(null)
  const [busy, setBusy] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement | null>(null)

  const selected = templates?.find((t) => t._id === selectedId) ?? null

  React.useEffect(() => {
    if (!templates || templates.length === 0) return
    if (!selectedId) {
      const def = templates.find((t) => t.isDefault) ?? templates[0]
      setSelectedId(def._id)
      setForm(toForm(def))
    }
  }, [templates, selectedId])

  function selectTemplate(t: Template) {
    setSelectedId(t._id)
    setForm(toForm(t))
  }

  if (templates === undefined) {
    return (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  async function onNew() {
    try {
      const id = await create({
        name: "New template",
        accentColor: "#4f46e5",
        fontFamily: FONT_OPTIONS[0].value,
        fontScale: 1,
        density: "normal",
        layout: makeDefaultLayout(),
        show: {
          employerContribs: true,
          cpfNote: true,
          funds: true,
          signatures: true,
          ytdSummary: false,
        },
      })
      setSelectedId(id)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't create template"))
    }
  }

  async function onSave() {
    if (!form || !selectedId) return
    setBusy(true)
    try {
      await update({
        templateId: selectedId as Id<"payslipTemplates">,
        name: form.name,
        accentColor: form.accentColor,
        textColor: form.textColor,
        fontFamily: form.fontFamily,
        fontScale: form.fontScale,
        density: form.density,
        headerText: form.headerText || null,
        footerText: form.footerText || null,
        layout: form.layout,
        show: showFromLayout(form.layout, form.show),
      })
      toast.success("Template saved")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save"))
    } finally {
      setBusy(false)
    }
  }

  async function onUploadLogo(file: File) {
    if (!selectedId) return
    try {
      const url = await getLogoUrl({})
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      })
      if (!res.ok) throw new Error("Upload failed")
      const { storageId } = (await res.json()) as { storageId: string }
      await update({
        templateId: selectedId as Id<"payslipTemplates">,
        logoStorageId: storageId as Id<"_storage">,
      })
      toast.success("Logo updated")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't upload logo"))
    }
  }

  return (
    <div className="grid gap-4 px-4 lg:grid-cols-[220px_1fr] lg:px-6">
      {/* Template list */}
      <div className="flex flex-col gap-2">
        {templates.map((t) => (
          <button
            key={t._id}
            type="button"
            onClick={() => selectTemplate(t)}
            className={cn(
              "flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm",
              t._id === selectedId
                ? "border-primary bg-muted/50"
                : "hover:bg-muted/40",
            )}
          >
            <span className="truncate">{t.name}</span>
            {t.isDefault && <Badge variant="secondary">Default</Badge>}
          </button>
        ))}
        <Button variant="outline" size="sm" onClick={onNew}>
          <IconPlus className="size-4" />
          New template
        </Button>
      </div>

      {/* Editor + preview */}
      {form && selected ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            {/* Typography & colour */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Font</Label>
                <Select
                  value={form.fontFamily}
                  onValueChange={(v) => setForm({ ...form, fontFamily: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_OPTIONS.map((f) => (
                      <SelectItem key={f.label} value={f.value}>
                        <span style={{ fontFamily: f.value }}>{f.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Density</Label>
                <Select
                  value={form.density}
                  onValueChange={(v) =>
                    setForm({ ...form, density: v as PayslipDensity })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DENSITY_OPTIONS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Font size · {Math.round(form.fontScale * 100)}%</Label>
              <input
                type="range"
                min={0.8}
                max={1.3}
                step={0.05}
                value={form.fontScale}
                onChange={(e) =>
                  setForm({ ...form, fontScale: Number(e.target.value) })
                }
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Accent colour</Label>
                <input
                  type="color"
                  value={form.accentColor}
                  onChange={(e) =>
                    setForm({ ...form, accentColor: e.target.value })
                  }
                  className="h-9 w-full rounded-md border"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="flex items-center justify-between">
                  Text colour
                  <label className="text-muted-foreground flex items-center gap-1.5 text-xs font-normal">
                    <Switch
                      checked={form.textColor !== null}
                      onCheckedChange={(c) =>
                        setForm({ ...form, textColor: c ? "#111827" : null })
                      }
                    />
                    Custom
                  </label>
                </Label>
                <input
                  type="color"
                  disabled={form.textColor === null}
                  value={form.textColor ?? "#111827"}
                  onChange={(e) =>
                    setForm({ ...form, textColor: e.target.value })
                  }
                  className="h-9 w-full rounded-md border disabled:opacity-40"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Header text</Label>
              <Input
                value={form.headerText}
                onChange={(e) =>
                  setForm({ ...form, headerText: e.target.value })
                }
                placeholder="e.g. 123 Main St · UEN 20240001A"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Footer text</Label>
              <Input
                value={form.footerText}
                onChange={(e) =>
                  setForm({ ...form, footerText: e.target.value })
                }
                placeholder="e.g. This is a computer-generated payslip."
              />
            </div>

            {/* Logo */}
            <div className="flex flex-col gap-2">
              <Label>Logo</Label>
              <div className="flex items-center gap-2">
                {selected.logoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selected.logoUrl}
                    alt=""
                    className="h-8 w-auto max-w-[120px] object-contain"
                  />
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                >
                  <IconUpload className="size-4" />
                  {selected.logoUrl ? "Replace" : "Upload"}
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void onUploadLogo(f)
                    e.target.value = ""
                  }}
                />
              </div>
            </div>

            {/* Drag-and-drop blocks */}
            <div className="rounded-lg border p-3">
              <BlockBuilder
                layout={form.layout}
                onChange={(layout) => setForm({ ...form, layout })}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={onSave} disabled={busy}>
                {busy ? "Saving…" : "Save template"}
              </Button>
              {!selected.isDefault && (
                <Button
                  variant="outline"
                  onClick={async () => {
                    await update({
                      templateId: selected._id as Id<"payslipTemplates">,
                      makeDefault: true,
                    })
                    toast.success("Set as default")
                  }}
                >
                  <IconStar className="size-4" />
                  Set default
                </Button>
              )}
              {templates.length > 1 && (
                <Button
                  variant="outline"
                  className="text-destructive"
                  onClick={async () => {
                    try {
                      await remove({
                        templateId: selected._id as Id<"payslipTemplates">,
                      })
                      setSelectedId(null)
                      setForm(null)
                      toast.success("Template deleted")
                    } catch (e) {
                      toast.error(getErrorMessage(e, "Couldn't delete"))
                    }
                  }}
                >
                  <IconTrash className="size-4" />
                  Delete
                </Button>
              )}
            </div>
          </div>

          {/* Live preview — sticky so it stays in view while editing/resizing */}
          <div className="lg:sticky lg:top-4 lg:self-start">
            <p className="text-muted-foreground mb-2 text-xs font-medium uppercase">
              Preview
            </p>
            <div className="origin-top max-h-[calc(100vh-8rem)] overflow-auto">
              <PayslipDocument slip={sampleSlip(form, selected.logoUrl)} />
            </div>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Select or create a template.
        </p>
      )}
    </div>
  )
}
