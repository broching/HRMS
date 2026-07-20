"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import {
  IconTrash,
  IconPlus,
  IconGripVertical,
  IconStar,
  IconArrowsMove,
  IconEye,
  IconEyeOff,
  IconPencil,
  IconLayoutGrid,
} from "@tabler/icons-react"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { restrictToVerticalAxis, restrictToParentElement } from "@dnd-kit/modifiers"
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import ReactGridLayout, { WidthProvider, type Layout } from "react-grid-layout"
import "react-grid-layout/css/styles.css"
import "react-resizable/css/styles.css"
import { api } from "@/convex/_generated/api"

const PrGridLayout = WidthProvider(ReactGridLayout)
import type { FunctionReturnType } from "convex/server"
import type { Id } from "@/convex/_generated/dataModel"
import type {
  PaymentRequestFieldType,
  PaymentRequestShow,
} from "@/convex/lib/enums"
import type { PayslipDensity } from "@/convex/lib/enums"
import { FONT_OPTIONS, DENSITY_OPTIONS } from "@/features/payroll/lib/payslip-layout"
import {
  PaymentRequestDocument,
  type PaymentRequestPrint,
} from "@/features/payment-requests/components/payment-request-document"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { getErrorMessage } from "@/lib/errors"
import { GRID_COLS, ROW_PX } from "@/features/payroll/lib/payslip-layout"
import {
  PR_ADDABLE_BLOCKS,
  PR_BLOCK_META,
  prMakeBlock,
  prMakeDefaultLayout,
  prNormalizeLayout,
  prDefaultBlockHeight,
  prNextRow,
  type PrLayoutBlock,
} from "@/features/payment-requests/lib/pr-layout"
import type { PaymentRequestBlockType } from "@/convex/lib/enums"

const FIELD_TYPES: { value: PaymentRequestFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Dropdown" },
]

type Template = FunctionReturnType<typeof api.paymentRequestTemplates.list>[number]

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

type FieldForm = {
  key: string
  label: string
  type: PaymentRequestFieldType
  required: boolean
  options: string
  placeholder: string
}

const DEFAULT_SHOW: PaymentRequestShow = {
  logo: true,
  heading: true,
  attachNote: true,
  signatures: true,
  requestorSignature: true,
  footer: true,
}

type Form = {
  name: string
  headerText: string
  isDefault: boolean
  active: boolean
  fields: FieldForm[]
  accentColor: string
  textColor: string
  fontFamily: string
  fontScale: number
  density: PayslipDensity
  show: PaymentRequestShow
  layout: PrLayoutBlock[]
}

function toForm(t: Template): Form {
  return {
    name: t.name,
    headerText: t.headerText ?? "",
    isDefault: t.isDefault,
    active: t.active,
    fields: t.fields.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: f.required,
      options: (f.options ?? []).join(", "),
      placeholder: f.placeholder ?? "",
    })),
    accentColor: t.accentColor ?? "#111827",
    textColor: t.textColor ?? "#111827",
    fontFamily: t.fontFamily ?? FONT_OPTIONS[1].value,
    fontScale: t.fontScale ?? 1,
    density: t.density ?? "normal",
    show: t.show ?? { ...DEFAULT_SHOW },
    layout: prNormalizeLayout((t.layout as PrLayoutBlock[] | null) ?? null),
  }
}

function newForm(): Form {
  return {
    name: "",
    headerText: "REQUEST FOR PAYMENT",
    isDefault: false,
    active: true,
    fields: [],
    accentColor: "#111827",
    textColor: "#111827",
    fontFamily: FONT_OPTIONS[1].value,
    fontScale: 1,
    density: "normal",
    show: { ...DEFAULT_SHOW },
    layout: prMakeDefaultLayout(),
  }
}

function SortableField({
  id,
  children,
}: {
  id: string
  children: (handle: React.ReactNode) => React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
    position: "relative",
    zIndex: isDragging ? 10 : undefined,
  }
  const handle = (
    <button
      type="button"
      className="text-muted-foreground/50 hover:text-foreground cursor-grab touch-none active:cursor-grabbing"
      aria-label="Drag to reorder"
      {...attributes}
      {...listeners}
    >
      <IconGripVertical className="size-4" />
    </button>
  )
  return (
    <div ref={setNodeRef} style={style}>
      {children(handle)}
    </div>
  )
}

// ─── Layout builder (drag + resize canvas) ──────────────────────────────────

function PrBlockTile({
  block,
  onPatch,
  onRemove,
  onEditText,
}: {
  block: PrLayoutBlock
  onPatch: (p: Partial<PrLayoutBlock>) => void
  onRemove: (() => void) | null
  onEditText: (() => void) | null
}) {
  const meta = PR_BLOCK_META[block.type]
  return (
    <div
      className={cn(
        "bg-background flex h-full flex-col overflow-hidden rounded-md border",
        !block.visible && "opacity-50",
      )}
    >
      <div className="pr-block-drag flex cursor-move items-center gap-1.5 border-b px-2 py-1.5">
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

function PrBlockBuilder({
  layout,
  onChange,
}: {
  layout: PrLayoutBlock[]
  onChange: (next: PrLayoutBlock[]) => void
}) {
  const [editId, setEditId] = React.useState<string | null>(null)
  const editing = layout.find((b) => b.id === editId) ?? null

  const rglLayout: Layout[] = layout.map((b) => ({
    i: b.id,
    x: b.x ?? 0,
    y: b.y ?? 0,
    w: b.w ?? GRID_COLS,
    h: b.h ?? prDefaultBlockHeight(b.type),
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
  function patch(id: string, p: Partial<PrLayoutBlock>) {
    onChange(layout.map((b) => (b.id === id ? { ...b, ...p } : b)))
  }
  function remove(id: string) {
    onChange(layout.filter((b) => b.id !== id))
  }
  function add(type: PaymentRequestBlockType) {
    const b = prMakeBlock(type)
    onChange([
      ...layout,
      {
        ...b,
        x: 0,
        y: prNextRow(layout),
        w: GRID_COLS,
        h: prDefaultBlockHeight(type),
      },
    ])
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5">
          <IconLayoutGrid className="size-4" />
          Document layout
        </Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <IconPlus className="size-4" />
              Add block
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {PR_ADDABLE_BLOCKS.map((t) => (
              <DropdownMenuItem key={t} onClick={() => add(t)}>
                {PR_BLOCK_META[t].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="text-muted-foreground text-xs">
        Drag a block by its header to move it, and drag its bottom-right corner
        to resize. Position, width and height carry through to the printed
        document.
      </p>
      <div className="bg-muted/30 rounded-lg border p-2">
        <PrGridLayout
          className="pr-layout-grid"
          layout={rglLayout}
          cols={GRID_COLS}
          rowHeight={ROW_PX}
          margin={[8, 8]}
          isBounded
          draggableHandle=".pr-block-drag"
          onLayoutChange={onLayoutChange}
          compactType="vertical"
        >
          {layout.map((b) => (
            <div key={b.id}>
              <PrBlockTile
                block={b}
                onPatch={(p) => patch(b.id, p)}
                onRemove={
                  PR_BLOCK_META[b.type].structural ? null : () => remove(b.id)
                }
                onEditText={
                  b.type === "customText" ? () => setEditId(b.id) : null
                }
              />
            </div>
          ))}
        </PrGridLayout>
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
                placeholder="Text to show on the document…"
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

// ─── Editor form (left column of the page) ──────────────────────────────────

function TemplateForm({
  form,
  setForm,
  hasLogo,
}: {
  form: Form
  setForm: React.Dispatch<React.SetStateAction<Form | null>>
  hasLogo: boolean
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  function patch(p: Partial<Form>) {
    setForm((f) => (f ? { ...f, ...p } : f))
  }
  function patchField(i: number, p: Partial<FieldForm>) {
    setForm((f) =>
      f
        ? { ...f, fields: f.fields.map((x, j) => (j === i ? { ...x, ...p } : x)) }
        : f,
    )
  }
  function onDragEnd(e: DragEndEvent) {
    const { active: a, over } = e
    if (!over || a.id === over.id) return
    setForm((f) => {
      if (!f) return f
      const from = f.fields.findIndex((x) => x.key === a.id)
      const to = f.fields.findIndex((x) => x.key === over.id)
      if (from < 0 || to < 0) return f
      return { ...f, fields: arrayMove(f.fields, from, to) }
    })
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label>Template name</Label>
        <Input
          value={form.name}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder="Ex. Request for Payment"
        />
      </div>
      <div className="grid gap-2">
        <Label>Document heading</Label>
        <Input
          value={form.headerText}
          onChange={(e) => patch({ headerText: e.target.value })}
          placeholder="REQUEST FOR PAYMENT"
        />
      </div>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={form.isDefault}
            onCheckedChange={(c) => patch({ isDefault: c === true })}
          />
          Default template
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={form.active}
            onCheckedChange={(c) => patch({ active: c === true })}
          />
          Active
        </label>
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label>Custom fields</Label>
          <span className="text-muted-foreground text-xs">
            Core fields (purpose, amount, payee, date) are always shown.
          </span>
        </div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={form.fields.map((f) => f.key)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-3">
              {form.fields.map((f, i) => (
                <SortableField key={f.key} id={f.key}>
                  {(handle) => (
                    <div className="bg-muted/30 flex flex-col gap-2 rounded-md border p-3">
                      <div className="flex items-center gap-2">
                        {handle}
                        <Input
                          className="h-8 flex-1"
                          placeholder="Field label (e.g. Bank Name)"
                          value={f.label}
                          onChange={(e) => patchField(i, { label: e.target.value })}
                        />
                        <Select
                          value={f.type}
                          onValueChange={(v) =>
                            patchField(i, { type: v as PaymentRequestFieldType })
                          }
                        >
                          <SelectTrigger className="w-32" size="sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FIELD_TYPES.map((t) => (
                              <SelectItem key={t.value} value={t.value}>
                                {t.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="icon"
                          className="text-destructive size-8"
                          onClick={() =>
                            setForm((cur) =>
                              cur
                                ? {
                                    ...cur,
                                    fields: cur.fields.filter((_, j) => j !== i),
                                  }
                                : cur,
                            )
                          }
                        >
                          <IconTrash className="size-4" />
                        </Button>
                      </div>
                      {f.type === "select" && (
                        <Input
                          className="h-8"
                          placeholder="Options, comma-separated (e.g. Cash, Cheque, Transfer)"
                          value={f.options}
                          onChange={(e) => patchField(i, { options: e.target.value })}
                        />
                      )}
                      <div className="flex items-center gap-4">
                        <Input
                          className="h-8 flex-1"
                          placeholder="Placeholder (optional)"
                          value={f.placeholder}
                          onChange={(e) =>
                            patchField(i, { placeholder: e.target.value })
                          }
                        />
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={f.required}
                            onCheckedChange={(c) =>
                              patchField(i, { required: c === true })
                            }
                          />
                          Required
                        </label>
                      </div>
                    </div>
                  )}
                </SortableField>
              ))}
            </div>
          </SortableContext>
        </DndContext>
        <button
          type="button"
          className="text-primary w-fit text-sm font-medium"
          onClick={() =>
            setForm((cur) =>
              cur
                ? {
                    ...cur,
                    fields: [
                      ...cur.fields,
                      {
                        key: newId(),
                        label: "",
                        type: "text",
                        required: false,
                        options: "",
                        placeholder: "",
                      },
                    ],
                  }
                : cur,
            )
          }
        >
          + Add field
        </button>
      </div>

      {/* Document style */}
      <div className="grid gap-3 border-t pt-4">
        <Label>Document style</Label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <span className="text-muted-foreground text-xs">Font</span>
            <Select
              value={form.fontFamily}
              onValueChange={(v) => patch({ fontFamily: v })}
            >
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FONT_OPTIONS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <span className="text-muted-foreground text-xs">Density</span>
            <Select
              value={form.density}
              onValueChange={(v) => patch({ density: v as PayslipDensity })}
            >
              <SelectTrigger size="sm">
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
          <div className="grid gap-1.5">
            <span className="text-muted-foreground text-xs">Heading colour</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-8 w-10 rounded border"
                value={form.accentColor}
                onChange={(e) => patch({ accentColor: e.target.value })}
              />
              <Input
                className="h-8"
                value={form.accentColor}
                onChange={(e) => patch({ accentColor: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <span className="text-muted-foreground text-xs">Body text colour</span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-8 w-10 rounded border"
                value={form.textColor}
                onChange={(e) => patch({ textColor: e.target.value })}
              />
              <Input
                className="h-8"
                value={form.textColor}
                onChange={(e) => patch({ textColor: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <span className="text-muted-foreground text-xs">
              Text size ({Math.round(form.fontScale * 100)}%)
            </span>
            <input
              type="range"
              min={0.8}
              max={1.3}
              step={0.05}
              value={form.fontScale}
              onChange={(e) => patch({ fontScale: Number(e.target.value) })}
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <span className="text-muted-foreground text-xs">Options</span>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={form.show.requestorSignature}
              onCheckedChange={(c) =>
                patch({
                  show: { ...form.show, requestorSignature: c === true },
                })
              }
            />
            Include a &ldquo;Requested by&rdquo; signature line
          </label>
          <p className="text-muted-foreground text-xs">
            Show, hide, move and resize whole sections in the Document layout
            below.
          </p>
          {!hasLogo && (
            <p className="text-muted-foreground text-xs">
              No organization logo uploaded yet — add one in Organization
              settings and it will appear here and on printed documents.
            </p>
          )}
        </div>
      </div>

      {/* Document layout (drag + resize) */}
      <div className="grid gap-2 border-t pt-4">
        <PrBlockBuilder
          layout={form.layout}
          onChange={(layout) => patch({ layout })}
        />
      </div>
    </div>
  )
}

// ─── Settings page ──────────────────────────────────────────────────────────

export function PaymentRequestTemplatesSettings() {
  const templates = useQuery(api.paymentRequestTemplates.list, {})
  // The org's own logo/name, so the preview mirrors the real printed document.
  const org = useQuery(api.organizations.current, {})
  const save = useMutation(api.paymentRequestTemplates.save)
  const seedDefault = useMutation(api.paymentRequestTemplates.seedDefault)
  const removeTemplate = useMutation(api.paymentRequestTemplates.remove)

  const [selectedId, setSelectedId] =
    React.useState<Id<"paymentRequestTemplates"> | null>(null)
  const [isNew, setIsNew] = React.useState(false)
  const [form, setForm] = React.useState<Form | null>(null)
  const [busy, setBusy] = React.useState(false)

  const selected = templates?.find((t) => t._id === selectedId) ?? null

  // Auto-select the default (or first) template once loaded, unless the user is
  // composing a brand-new one.
  React.useEffect(() => {
    if (!templates || templates.length === 0) return
    if (isNew || selectedId) return
    const def = templates.find((t) => t.isDefault) ?? templates[0]
    setSelectedId(def._id)
    setForm(toForm(def))
  }, [templates, selectedId, isNew])

  function selectTemplate(t: Template) {
    setIsNew(false)
    setSelectedId(t._id)
    setForm(toForm(t))
  }

  function onNew() {
    setIsNew(true)
    setSelectedId(null)
    setForm(newForm())
  }

  async function onSave() {
    if (!form) return
    if (!form.name.trim()) return toast.error("Template needs a name.")
    for (const f of form.fields) {
      if (!f.label.trim()) return toast.error("Every field needs a label.")
      if (f.type === "select" && !f.options.trim())
        return toast.error(`"${f.label}" needs at least one dropdown option.`)
    }
    setBusy(true)
    try {
      const id = await save({
        templateId: selectedId ?? undefined,
        name: form.name.trim(),
        headerText: form.headerText.trim() || undefined,
        isDefault: form.isDefault,
        active: form.active,
        fields: form.fields.map((f) => ({
          key: f.key,
          label: f.label.trim(),
          type: f.type,
          required: f.required,
          options:
            f.type === "select"
              ? f.options.split(",").map((o) => o.trim()).filter(Boolean)
              : undefined,
          placeholder: f.placeholder.trim() || undefined,
        })),
        accentColor: form.accentColor,
        textColor: form.textColor,
        fontFamily: form.fontFamily,
        fontScale: form.fontScale,
        density: form.density,
        show: form.show,
        layout: form.layout,
      })
      setIsNew(false)
      setSelectedId(id)
      toast.success("Template saved")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save template"))
    } finally {
      setBusy(false)
    }
  }

  async function onDelete() {
    if (!selectedId) return
    try {
      await removeTemplate({ templateId: selectedId })
      setSelectedId(null)
      setForm(null)
      toast.success("Template deleted")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't delete template"))
    }
  }

  if (templates === undefined) {
    return (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  // Sample request used to render the live style/layout preview.
  const sampleReq = form
    ? ({
        _id: "preview",
        requestNumber: 7,
        orgName: org?.name ?? "Your Company",
        logoUrl: org?.imageUrl ?? null,
        headerText: form.headerText || "REQUEST FOR PAYMENT",
        style: null,
        employeeName: "Muhammad Falikh Bin Fisal",
        purpose: "Purchase of office furniture for Malaysia office",
        amountCents: 2278060,
        currency: "MYR",
        payeeName: "MUHAMMAD FALIKH BIN FISAL",
        requestDate: "2026-07-08",
        status: "pending_manager",
        templateFields: form.fields.map((f) => ({
          key: f.key,
          label: f.label || "Field",
          type: f.type,
          required: f.required,
          options:
            f.type === "select"
              ? f.options.split(",").map((o) => o.trim()).filter(Boolean)
              : undefined,
          placeholder: f.placeholder || undefined,
        })),
        fieldValues: Object.fromEntries(
          form.fields.map((f) => [
            f.key,
            f.type === "date"
              ? "2026-07-08"
              : f.type === "number"
                ? "100.00"
                : f.type === "select"
                  ? (f.options.split(",")[0]?.trim() ?? "Option")
                  : "Sample value",
          ]),
        ),
        remarks: null,
        requestorSignatureUrl: null,
        signatures: [],
        attachments: [],
      } as unknown as PaymentRequestPrint)
    : null

  const previewStyle = form
    ? {
        accentColor: form.accentColor,
        fontFamily: form.fontFamily,
        textColor: form.textColor,
        fontScale: form.fontScale,
        density: form.density,
        show: form.show,
        layout: form.layout,
      }
    : undefined

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Customize the payment-request form with your organization&rsquo;s own
          fields.
        </p>
        <div className="flex gap-2">
          {templates.length === 0 && (
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await seedDefault({})
                  toast.success("Default template added")
                } catch (e) {
                  toast.error(
                    getErrorMessage(e, "Couldn't add default template"),
                  )
                }
              }}
            >
              Add default template
            </Button>
          )}
          <Button onClick={onNew}>
            <IconPlus className="size-4" />
            New template
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        {/* Template list */}
        <div className="flex flex-col gap-2">
          {templates.map((t) => (
            <button
              key={t._id}
              type="button"
              onClick={() => selectTemplate(t)}
              className={cn(
                "flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm",
                t._id === selectedId && !isNew
                  ? "border-primary bg-muted/50"
                  : "hover:bg-muted/40",
              )}
            >
              <span className="min-w-0 truncate">
                {t.name}
                {!t.active && (
                  <span className="text-muted-foreground"> · inactive</span>
                )}
              </span>
              {t.isDefault && (
                <IconStar className="size-4 shrink-0 text-amber-500" />
              )}
            </button>
          ))}
          {isNew && (
            <div className="border-primary bg-muted/50 rounded-md border px-3 py-2 text-sm">
              New template…
            </div>
          )}
          {templates.length === 0 && !isNew && (
            <p className="text-muted-foreground text-xs">
              No templates yet. Add the default template or create your own.
            </p>
          )}
        </div>

        {/* Editor + live preview */}
        {form ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <TemplateForm
                form={form}
                setForm={setForm}
                hasLogo={!!org?.imageUrl}
              />
              <div className="flex flex-wrap gap-2 border-t pt-4">
                <Button onClick={onSave} disabled={busy}>
                  {busy ? "Saving…" : "Save template"}
                </Button>
                {selected && (
                  <Button
                    variant="outline"
                    className="text-destructive"
                    onClick={onDelete}
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
              <div className="max-h-[calc(100vh-8rem)] overflow-auto rounded-md border bg-white">
                {sampleReq && (
                  <PaymentRequestDocument
                    req={sampleReq}
                    styleOverride={previewStyle}
                  />
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Select a template on the left, or create a new one.
          </p>
        )}
      </div>
    </div>
  )
}
