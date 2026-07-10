"use client"

import * as React from "react"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { toast } from "sonner"
import { IconPlus, IconTrash, IconStar, IconUpload } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { getErrorMessage } from "@/lib/errors"
import { PayslipDocument } from "@/features/payroll/components/payslip-document"

type Template = FunctionReturnType<typeof api.payslipTemplates.list>[number]
type Payslip = FunctionReturnType<typeof api.payroll.getPayslip>

const FONT_OPTIONS = [
  {
    label: "Sans",
    value:
      "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  },
  {
    label: "Serif",
    value: 'ui-serif, Georgia, Cambria, "Times New Roman", serif',
  },
  { label: "Mono", value: "ui-monospace, SFMono-Regular, Menlo, monospace" },
]

type Show = Template["show"]
type Form = {
  name: string
  accentColor: string
  fontFamily: string
  headerText: string
  footerText: string
  show: Show
}

function toForm(t: Template): Form {
  return {
    name: t.name,
    accentColor: t.accentColor,
    fontFamily: t.fontFamily,
    headerText: t.headerText ?? "",
    footerText: t.footerText ?? "",
    show: t.show,
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
    cpfStatus: "citizen_pr",
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
      fontFamily: form.fontFamily,
      logoUrl,
      headerText: form.headerText || null,
      footerText: form.footerText || null,
      show: form.show,
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

  // Select the default (or first) template and seed the form.
  React.useEffect(() => {
    if (!templates || templates.length === 0) return
    if (!selectedId) {
      const def = templates.find((t) => t.isDefault) ?? templates[0]
      setSelectedId(def._id)
      setForm(toForm(def))
    }
  }, [templates, selectedId])

  // Re-seed the form when switching templates.
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
        fontFamily: form.fontFamily,
        headerText: form.headerText || null,
        footerText: form.footerText || null,
        show: form.show,
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

  function patchShow(p: Partial<Show>) {
    setForm((f) => (f ? { ...f, show: { ...f.show, ...p } } : f))
  }

  return (
    <div className="grid gap-4 px-4 lg:grid-cols-[240px_1fr] lg:px-6">
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
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
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
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

            <div className="flex flex-col gap-2 rounded-lg border p-3">
              <Label>Sections</Label>
              {(
                [
                  ["employerContribs", "Employer contributions"],
                  ["cpfNote", "CPF footnote"],
                  ["signatures", "Signatures"],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center justify-between text-sm"
                >
                  {label}
                  <Switch
                    checked={form.show[key]}
                    onCheckedChange={(c) => patchShow({ [key]: c } as Partial<Show>)}
                  />
                </label>
              ))}
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

          {/* Live preview */}
          <div className="overflow-hidden">
            <p className="text-muted-foreground mb-2 text-xs font-medium uppercase">
              Preview
            </p>
            <div className="origin-top scale-95">
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
