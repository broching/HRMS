"use client"

import * as React from "react"
import {
  IconChevronUp,
  IconChevronDown,
  IconCopy,
  IconTrash,
  IconPlus,
  IconGripVertical,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
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
import {
  type CycleForm,
  type FormField,
  type FormFieldSide,
  type FormFieldType,
  type FormSection,
  FIELD_TYPE_META,
  ADDABLE_FIELD_TYPES,
  SIDE_LABELS,
  blankField,
  blankSection,
  moveItem,
  totalWeight,
} from "@/features/performance/lib/form-builder-model"

function OptionsEditor({
  options,
  onChange,
}: {
  options: string[]
  onChange: (o: string[]) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">Options</Label>
      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            value={opt}
            onChange={(e) => {
              const next = options.slice()
              next[i] = e.target.value
              onChange(next)
            }}
            className="h-8"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => onChange(options.filter((_, j) => j !== i))}
            disabled={options.length <= 2}
            aria-label="Remove option"
          >
            <IconTrash className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={() => onChange([...options, `Option ${options.length + 1}`])}
      >
        <IconPlus className="size-3.5" /> Add option
      </Button>
    </div>
  )
}

function FieldEditor({
  field,
  index,
  count,
  onChange,
  onMove,
  onRemove,
  onDuplicate,
}: {
  field: FormField
  index: number
  count: number
  onChange: (f: FormField) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
  onDuplicate: () => void
}) {
  const meta = FIELD_TYPE_META[field.type]
  const patch = (p: Partial<FormField>) => onChange({ ...field, ...p })

  return (
    <div className="bg-muted/30 flex flex-col gap-3 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <IconGripVertical className="text-muted-foreground size-4 shrink-0" />
        <Badge variant="secondary" className="shrink-0">
          {meta.label}
        </Badge>
        <div className="ml-auto flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Move up"
          >
            <IconChevronUp className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onMove(1)}
            disabled={index === count - 1}
            aria-label="Move down"
          >
            <IconChevronDown className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onDuplicate}
            aria-label="Duplicate field"
          >
            <IconCopy className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onRemove}
            aria-label="Remove field"
          >
            <IconTrash className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">
          {field.type === "section" ? "Heading" : "Question / label"}
        </Label>
        <Input
          value={field.label}
          placeholder={meta.hint}
          onChange={(e) => patch({ label: e.target.value })}
        />
      </div>

      {meta.isBlock && (
        <p className="text-muted-foreground text-xs">
          {field.type === "objectives"
            ? "Objectives are entered per employee when the form is filled."
            : "Pulls from the org competency library."}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Answered by</Label>
          <Select
            value={field.side}
            onValueChange={(v) => patch({ side: v as FormFieldSide })}
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SIDE_LABELS) as FormFieldSide[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {SIDE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {meta.hasScale && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Scale max</Label>
            <Select
              value={String(field.scaleMax ?? 5)}
              onValueChange={(v) => patch({ scaleMax: Number(v) })}
            >
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[3, 4, 5, 6, 7, 10].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    1–{n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {meta.isScored && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Weight %</Label>
            <Input
              inputMode="numeric"
              value={String(field.weightPct ?? 0)}
              onChange={(e) =>
                patch({ weightPct: Number(e.target.value) || 0 })
              }
              className="h-8"
            />
          </div>
        )}
      </div>

      {meta.hasOptions && (
        <OptionsEditor
          options={field.options ?? []}
          onChange={(o) => patch({ options: o })}
        />
      )}

      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Helper text (optional)</Label>
          <Input
            value={field.description ?? ""}
            onChange={(e) =>
              patch({ description: e.target.value || undefined })
            }
            className="h-8 w-64 max-w-full"
          />
        </div>
        {meta.answerable && (
          <label className="flex items-center gap-2 text-xs">
            <Switch
              checked={!!field.required}
              onCheckedChange={(c) => patch({ required: c })}
            />
            Required
          </label>
        )}
      </div>
    </div>
  )
}

function SectionEditor({
  section,
  index,
  count,
  onChange,
  onMove,
  onRemove,
}: {
  section: FormSection
  index: number
  count: number
  onChange: (s: FormSection) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
}) {
  const setFields = (fields: FormField[]) => onChange({ ...section, fields })

  function addField(type: FormFieldType) {
    setFields([...section.fields, blankField(type)])
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-start gap-2">
        <div className="flex flex-1 flex-col gap-2">
          <Input
            value={section.title}
            onChange={(e) => onChange({ ...section, title: e.target.value })}
            placeholder="Section title"
            className="font-medium"
          />
          <Input
            value={section.description ?? ""}
            onChange={(e) =>
              onChange({ ...section, description: e.target.value || undefined })
            }
            placeholder="Section description (optional)"
            className="text-muted-foreground h-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Move section up"
          >
            <IconChevronUp className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onMove(1)}
            disabled={index === count - 1}
            aria-label="Move section down"
          >
            <IconChevronDown className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onRemove}
            aria-label="Remove section"
          >
            <IconTrash className="size-4" />
          </Button>
        </div>
      </div>

      {section.fields.length > 0 && (
        <div className="flex flex-col gap-2">
          {section.fields.map((f, i) => (
            <FieldEditor
              key={f.id}
              field={f}
              index={i}
              count={section.fields.length}
              onChange={(nf) =>
                setFields(section.fields.map((x, j) => (j === i ? nf : x)))
              }
              onMove={(dir) => setFields(moveItem(section.fields, i, i + dir))}
              onRemove={() =>
                setFields(section.fields.filter((_, j) => j !== i))
              }
              onDuplicate={() => {
                const dup = { ...f, id: blankField(f.type).id }
                const next = section.fields.slice()
                next.splice(i + 1, 0, dup)
                setFields(next)
              }}
            />
          ))}
        </div>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="w-fit">
            <IconPlus className="size-3.5" /> Add field
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
          {ADDABLE_FIELD_TYPES.map((t) => (
            <DropdownMenuItem key={t} onClick={() => addField(t)}>
              <div className="flex flex-col">
                <span>{FIELD_TYPE_META[t].label}</span>
                <span className="text-muted-foreground text-xs">
                  {FIELD_TYPE_META[t].hint}
                </span>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function FormBuilder({
  form,
  onChange,
}: {
  form: CycleForm
  onChange: (f: CycleForm) => void
}) {
  const setSections = (sections: FormSection[]) => onChange({ ...form, sections })
  const weight = totalWeight(form)

  return (
    <div className="flex flex-col gap-4">
      {form.sections.map((s, i) => (
        <SectionEditor
          key={s.id}
          section={s}
          index={i}
          count={form.sections.length}
          onChange={(ns) =>
            setSections(form.sections.map((x, j) => (j === i ? ns : x)))
          }
          onMove={(dir) => setSections(moveItem(form.sections, i, i + dir))}
          onRemove={() => setSections(form.sections.filter((_, j) => j !== i))}
        />
      ))}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setSections([...form.sections, blankSection()])}
        >
          <IconPlus className="size-4" /> Add section
        </Button>
        <span
          className={cn(
            "text-xs",
            weight === 100 ? "text-emerald-600" : "text-muted-foreground",
          )}
        >
          Scored weight total: {weight}%
          {weight !== 100 && " (aim for 100%)"}
        </span>
      </div>
    </div>
  )
}
