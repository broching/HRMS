"use client"

import type { PaymentRequestField } from "@/convex/lib/enums"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Render a template's org-defined custom fields as form inputs, binding each to
// `values[field.key]` (all stored as strings). Shared by the submit + edit forms.
export function CustomFieldInputs({
  fields,
  values,
  onChange,
}: {
  fields: PaymentRequestField[]
  values: Record<string, string>
  onChange: (key: string, value: string) => void
}) {
  if (fields.length === 0) return null
  return (
    <>
      {fields.map((f) => (
        <div key={f.key} className="grid gap-2">
          <Label>
            {f.label}{" "}
            {f.required && <span className="text-destructive">*</span>}
          </Label>
          {f.type === "textarea" ? (
            <Textarea
              rows={2}
              placeholder={f.placeholder}
              value={values[f.key] ?? ""}
              onChange={(e) => onChange(f.key, e.target.value)}
            />
          ) : f.type === "select" ? (
            <Select
              value={values[f.key] ?? ""}
              onValueChange={(v) => onChange(f.key, v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {(f.options ?? []).map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
              placeholder={f.placeholder}
              value={values[f.key] ?? ""}
              onChange={(e) => onChange(f.key, e.target.value)}
            />
          )}
        </div>
      ))}
    </>
  )
}
