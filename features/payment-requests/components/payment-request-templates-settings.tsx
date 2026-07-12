"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import {
  IconTrash,
  IconPlus,
  IconGripVertical,
  IconStar,
  IconStarFilled,
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
import { api } from "@/convex/_generated/api"
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getErrorMessage } from "@/lib/errors"

const FIELD_TYPES: { value: PaymentRequestFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Dropdown" },
]

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

function TemplateEditor({
  templateId,
  open,
  onOpenChange,
}: {
  templateId: Id<"paymentRequestTemplates"> | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const existing = useQuery(
    api.paymentRequestTemplates.get,
    open && templateId ? { templateId } : "skip",
  )
  // The org's own logo/name, so the preview mirrors the real printed document.
  const org = useQuery(api.organizations.current, open ? {} : "skip")
  const save = useMutation(api.paymentRequestTemplates.save)

  const [name, setName] = React.useState("")
  const [headerText, setHeaderText] = React.useState("")
  const [isDefault, setIsDefault] = React.useState(false)
  const [active, setActive] = React.useState(true)
  const [fields, setFields] = React.useState<FieldForm[]>([])
  // Document styling.
  const [accentColor, setAccentColor] = React.useState("#111827")
  const [textColor, setTextColor] = React.useState("#111827")
  const [fontFamily, setFontFamily] = React.useState(FONT_OPTIONS[1].value)
  const [fontScale, setFontScale] = React.useState(1)
  const [density, setDensity] = React.useState<PayslipDensity>("normal")
  const [show, setShow] = React.useState<PaymentRequestShow>({
    logo: true,
    heading: true,
    attachNote: true,
    signatures: true,
    requestorSignature: true,
    footer: true,
  })
  const [busy, setBusy] = React.useState(false)
  const seeded = React.useRef<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  React.useEffect(() => {
    if (!open) {
      seeded.current = null
      return
    }
    if (templateId && existing && seeded.current !== existing._id) {
      seeded.current = existing._id
      setName(existing.name)
      setHeaderText(existing.headerText ?? "")
      setIsDefault(existing.isDefault)
      setActive(existing.active)
      setFields(
        existing.fields.map((f) => ({
          key: f.key,
          label: f.label,
          type: f.type,
          required: f.required,
          options: (f.options ?? []).join(", "),
          placeholder: f.placeholder ?? "",
        })),
      )
      setAccentColor(existing.accentColor ?? "#111827")
      setTextColor(existing.textColor ?? "#111827")
      setFontFamily(existing.fontFamily ?? FONT_OPTIONS[1].value)
      setFontScale(existing.fontScale ?? 1)
      setDensity(existing.density ?? "normal")
      setShow(
        existing.show ?? {
          logo: true,
          heading: true,
          attachNote: true,
          signatures: true,
          requestorSignature: true,
          footer: true,
        },
      )
    } else if (!templateId && seeded.current !== "new") {
      seeded.current = "new"
      setName("")
      setHeaderText("REQUEST FOR PAYMENT")
      setIsDefault(false)
      setActive(true)
      setFields([])
      setAccentColor("#111827")
      setTextColor("#111827")
      setFontFamily(FONT_OPTIONS[1].value)
      setFontScale(1)
      setDensity("normal")
      setShow({
        logo: true,
        heading: true,
        attachNote: true,
        signatures: true,
        requestorSignature: true,
        footer: true,
      })
    }
  }, [open, templateId, existing])

  function patchField(i: number, p: Partial<FieldForm>) {
    setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...p } : f)))
  }
  function onDragEnd(e: DragEndEvent) {
    const { active: a, over } = e
    if (!over || a.id === over.id) return
    const from = fields.findIndex((f) => f.key === a.id)
    const to = fields.findIndex((f) => f.key === over.id)
    if (from < 0 || to < 0) return
    setFields(arrayMove(fields, from, to))
  }

  async function handleSave() {
    if (!name.trim()) return toast.error("Template needs a name.")
    for (const f of fields) {
      if (!f.label.trim()) return toast.error("Every field needs a label.")
      if (f.type === "select" && !f.options.trim())
        return toast.error(`"${f.label}" needs at least one dropdown option.`)
    }
    setBusy(true)
    try {
      await save({
        templateId: templateId ?? undefined,
        name: name.trim(),
        headerText: headerText.trim() || undefined,
        isDefault,
        active,
        fields: fields.map((f) => ({
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
        accentColor,
        textColor,
        fontFamily,
        fontScale,
        density,
        show,
      })
      toast.success("Template saved")
      onOpenChange(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save template"))
    } finally {
      setBusy(false)
    }
  }

  // Sample request used to render the live style preview.
  const sampleReq = {
    _id: "preview",
    requestNumber: 7,
    orgName: org?.name ?? "Your Company",
    logoUrl: org?.imageUrl ?? null,
    headerText: headerText || "REQUEST FOR PAYMENT",
    style: null,
    employeeName: "Muhammad Falikh Bin Fisal",
    purpose: "Purchase of office furniture for Malaysia office",
    amountCents: 2278060,
    currency: "MYR",
    payeeName: "MUHAMMAD FALIKH BIN FISAL",
    requestDate: "2026-07-08",
    status: "pending_manager",
    templateFields: fields.map((f) => ({
      key: f.key,
      label: f.label || "Field",
      type: f.type,
      required: f.required,
      options: f.type === "select" ? f.options.split(",").map((o) => o.trim()).filter(Boolean) : undefined,
      placeholder: f.placeholder || undefined,
    })),
    fieldValues: Object.fromEntries(
      fields.map((f) => [
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
  } as unknown as PaymentRequestPrint

  const previewStyle = { accentColor, fontFamily, textColor, fontScale, density, show }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{templateId ? "Edit template" : "New template"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Template name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. Request for Payment"
            />
          </div>
          <div className="grid gap-2">
            <Label>Document heading</Label>
            <Input
              value={headerText}
              onChange={(e) => setHeaderText(e.target.value)}
              placeholder="REQUEST FOR PAYMENT"
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={isDefault} onCheckedChange={(c) => setIsDefault(c === true)} />
              Default template
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={active} onCheckedChange={(c) => setActive(c === true)} />
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
              <SortableContext items={fields.map((f) => f.key)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-3">
                  {fields.map((f, i) => (
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
                              onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))}
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
                              onChange={(e) => patchField(i, { placeholder: e.target.value })}
                            />
                            <label className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={f.required}
                                onCheckedChange={(c) => patchField(i, { required: c === true })}
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
                setFields((fs) => [
                  ...fs,
                  {
                    key: newId(),
                    label: "",
                    type: "text",
                    required: false,
                    options: "",
                    placeholder: "",
                  },
                ])
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
                <Select value={fontFamily} onValueChange={setFontFamily}>
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
                <Select value={density} onValueChange={(v) => setDensity(v as PayslipDensity)}>
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
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                  />
                  <Input
                    className="h-8"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <span className="text-muted-foreground text-xs">Body text colour</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    className="h-8 w-10 rounded border"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                  />
                  <Input
                    className="h-8"
                    value={textColor}
                    onChange={(e) => setTextColor(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <span className="text-muted-foreground text-xs">
                  Text size ({Math.round(fontScale * 100)}%)
                </span>
                <input
                  type="range"
                  min={0.8}
                  max={1.3}
                  step={0.05}
                  value={fontScale}
                  onChange={(e) => setFontScale(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <span className="text-muted-foreground text-xs">Show on document</span>
              <div className="flex flex-wrap gap-4">
                {(
                  [
                    ["logo", "Logo"],
                    ["heading", "Heading"],
                    ["attachNote", "Attach note"],
                    ["signatures", "Signatures"],
                    ["requestorSignature", "Requester signature"],
                    ["footer", "Footer"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={show[key]}
                      onCheckedChange={(c) => setShow((s) => ({ ...s, [key]: c === true }))}
                    />
                    {label}
                  </label>
                ))}
              </div>
              {show.logo && org && !org.imageUrl && (
                <p className="text-muted-foreground text-xs">
                  No organization logo uploaded yet — add one in Organization
                  settings and it will appear here and on printed documents.
                </p>
              )}
            </div>
          </div>

          {/* Live preview */}
          <div className="grid gap-1.5">
            <span className="text-muted-foreground text-xs">Preview</span>
            <div className="max-h-[420px] overflow-auto rounded-md border bg-white">
              <PaymentRequestDocument req={sampleReq} styleOverride={previewStyle} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? "Saving…" : "Save template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function PaymentRequestTemplatesSettings() {
  const templates = useQuery(api.paymentRequestTemplates.list, {})
  const seedDefault = useMutation(api.paymentRequestTemplates.seedDefault)
  const removeTemplate = useMutation(api.paymentRequestTemplates.remove)
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [editId, setEditId] = React.useState<Id<"paymentRequestTemplates"> | null>(null)

  if (templates === undefined) {
    return (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  function openNew() {
    setEditId(null)
    setEditorOpen(true)
  }

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          Customize the payment-request form with your organization&rsquo;s own fields.
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
                  toast.error(getErrorMessage(e, "Couldn't add default template"))
                }
              }}
            >
              Add default template
            </Button>
          )}
          <Button onClick={openNew}>
            <IconPlus className="size-4" />
            New template
          </Button>
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border py-12 text-center text-sm">
          No templates yet. Add the default &ldquo;Request for Payment&rdquo; template to get
          started, or create your own.
        </div>
      ) : (
        <div className="grid gap-3">
          {templates.map((t) => (
            <div
              key={t._id}
              className="flex items-center justify-between gap-3 rounded-lg border p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {t.isDefault ? (
                    <IconStarFilled className="size-4 text-amber-500" />
                  ) : (
                    <IconStar className="text-muted-foreground/40 size-4" />
                  )}
                  <span className="font-medium">{t.name}</span>
                  {!t.active && <Badge variant="outline">Inactive</Badge>}
                </div>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {t.fields.length} custom field{t.fields.length === 1 ? "" : "s"}
                  {t.fields.length > 0 && ` · ${t.fields.map((f) => f.label).join(", ")}`}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditId(t._id)
                    setEditorOpen(true)
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive size-8"
                  onClick={async () => {
                    try {
                      await removeTemplate({ templateId: t._id })
                      toast.success("Template deleted")
                    } catch (e) {
                      toast.error(getErrorMessage(e, "Couldn't delete template"))
                    }
                  }}
                >
                  <IconTrash className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <TemplateEditor templateId={editId} open={editorOpen} onOpenChange={setEditorOpen} />
    </div>
  )
}
