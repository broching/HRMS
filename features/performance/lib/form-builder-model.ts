// Client-side helpers for the appraisal form builder. The form shape mirrors the
// Convex validators in `convex/lib/enums.ts`; we reuse those types directly.

import type {
  CycleForm,
  FormField,
  FormFieldType,
  FormFieldSide,
  FormSection,
} from "@/convex/lib/enums"

export type { CycleForm, FormField, FormFieldType, FormFieldSide, FormSection }

// Metadata per field type: how it renders in the palette + what config it needs.
export const FIELD_TYPE_META: Record<
  FormFieldType,
  {
    label: string
    hint: string
    hasOptions: boolean // radio / checkbox
    hasScale: boolean // ratingScale
    isScored: boolean // contributes to the weighted overall score
    isBlock: boolean // objectives / competencies (own tables)
    answerable: boolean // false for `section`
  }
> = {
  section: {
    label: "Section heading",
    hint: "A titled group of fields.",
    hasOptions: false,
    hasScale: false,
    isScored: false,
    isBlock: false,
    answerable: false,
  },
  shortText: {
    label: "Short text",
    hint: "A single line of text.",
    hasOptions: false,
    hasScale: false,
    isScored: false,
    isBlock: false,
    answerable: true,
  },
  longText: {
    label: "Paragraph",
    hint: "A multi-line text answer.",
    hasOptions: false,
    hasScale: false,
    isScored: false,
    isBlock: false,
    answerable: true,
  },
  ratingScale: {
    label: "Rating scale",
    hint: "A 1–N rating that counts toward the score.",
    hasOptions: false,
    hasScale: true,
    isScored: true,
    isBlock: false,
    answerable: true,
  },
  radio: {
    label: "Single choice",
    hint: "Pick one option.",
    hasOptions: true,
    hasScale: false,
    isScored: false,
    isBlock: false,
    answerable: true,
  },
  checkbox: {
    label: "Multiple choice",
    hint: "Pick any number of options.",
    hasOptions: true,
    hasScale: false,
    isScored: false,
    isBlock: false,
    answerable: true,
  },
  yesNo: {
    label: "Yes / No",
    hint: "A yes-or-no answer.",
    hasOptions: false,
    hasScale: false,
    isScored: false,
    isBlock: false,
    answerable: true,
  },
  objectives: {
    label: "Objectives block",
    hint: "Weighted objectives, rated by both sides.",
    hasOptions: false,
    hasScale: false,
    isScored: true,
    isBlock: true,
    answerable: true,
  },
  competencies: {
    label: "Competencies block",
    hint: "Rated against the org competency library.",
    hasOptions: false,
    hasScale: false,
    isScored: true,
    isBlock: true,
    answerable: true,
  },
  date: {
    label: "Date",
    hint: "A date answer.",
    hasOptions: false,
    hasScale: false,
    isScored: false,
    isBlock: false,
    answerable: true,
  },
  file: {
    label: "File upload",
    hint: "Attach one or more files.",
    hasOptions: false,
    hasScale: false,
    isScored: false,
    isBlock: false,
    answerable: true,
  },
  signature: {
    label: "Signature",
    hint: "Draw or type a signature.",
    hasOptions: false,
    hasScale: false,
    isScored: false,
    isBlock: false,
    answerable: true,
  },
}

// Field types offered in the "add field" palette, in display order.
// `objectives` is intentionally omitted — it isn't supported in the app for now.
export const ADDABLE_FIELD_TYPES: FormFieldType[] = [
  "shortText",
  "longText",
  "ratingScale",
  "radio",
  "checkbox",
  "yesNo",
  "date",
  "file",
  "signature",
  "competencies",
]

export const SIDE_LABELS: Record<FormFieldSide, string> = {
  self: "Employee only",
  appraiser: "Appraiser only",
  both: "Both sides",
}

function genId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`
}

export function blankField(type: FormFieldType): FormField {
  const meta = FIELD_TYPE_META[type]
  return {
    id: genId("f"),
    type,
    label: meta.isBlock ? meta.label : "",
    side: "both",
    ...(meta.hasScale ? { scaleMax: 5 } : {}),
    ...(meta.hasOptions ? { options: ["Option 1", "Option 2"] } : {}),
    ...(meta.isScored ? { weightPct: 0 } : {}),
  }
}

export function blankSection(): FormSection {
  return { id: genId("sec"), title: "New section", fields: [] }
}

export function emptyForm(): CycleForm {
  return {
    sections: [{ ...blankSection(), title: "Section 1" }],
  }
}

// Sum of weights across all scored fields — shown so HR can aim for ~100.
export function totalWeight(form: CycleForm): number {
  return form.sections
    .flatMap((s) => s.fields)
    .filter((f) => FIELD_TYPE_META[f.type].isScored)
    .reduce((sum, f) => sum + (f.weightPct ?? 0), 0)
}

export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length) return arr
  const next = arr.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
