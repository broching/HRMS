"use client"

import * as React from "react"
import type { Ir8aCategory } from "@/convex/lib/enums"
import { PAYROLL_ITEM_PRESETS } from "@/convex/lib/ir8aPresets"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  IR8A_CATEGORIES,
  IR8A_CATEGORY_LABELS,
} from "@/features/payroll/lib/ir8a-labels"

const CUSTOM = "__custom__"

export type PayrollItemValue = {
  name: string
  category: Ir8aCategory | undefined
  // Present only when a preset was picked, so the caller can apply its default
  // CPF treatment. Undefined for custom / typed names (caller keeps its value).
  cpfable?: boolean
}

type Option = { key: string; label: string; category: Ir8aCategory }

// A name field for a classifiable payroll earning (allowance / addition). Users
// pick a system-default item — which fills the label and its IR8A income
// classification in one step — or "Custom…", which reveals a free-text name plus
// a required classification they set themselves at creation time. Previously
// classified org labels are merged into the list so past choices are reusable.
export function PayrollItemNameField({
  name,
  category,
  onChange,
  orgLabels,
  className,
  placeholder = "Select or add an item…",
}: {
  name: string
  category: Ir8aCategory | undefined
  onChange: (next: PayrollItemValue) => void
  orgLabels?: { label: string; category: Ir8aCategory }[]
  className?: string
  placeholder?: string
}) {
  // Preset options, plus any org-specific classified labels not already covered.
  const options = React.useMemo<Option[]>(() => {
    const byNorm = new Map<string, Option>()
    for (const p of PAYROLL_ITEM_PRESETS) {
      byNorm.set(p.label.trim().toLowerCase(), {
        key: p.label.trim().toLowerCase(),
        label: p.label,
        category: p.category,
      })
    }
    for (const l of orgLabels ?? []) {
      const norm = l.label.trim().toLowerCase()
      if (!norm || byNorm.has(norm)) continue
      // Org labels are stored lowercased; title-case for display readability.
      byNorm.set(norm, { key: norm, label: l.label, category: l.category })
    }
    return [...byNorm.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [orgLabels])

  const norm = name.trim().toLowerCase()
  const matched = options.find((o) => o.key === norm)
  // Custom mode: an explicit choice, or a typed name that matches no preset.
  const [customChosen, setCustomChosen] = React.useState(false)
  const isCustom = customChosen || (!!name && !matched)
  const selectValue = isCustom ? CUSTOM : (matched?.key ?? "")

  function handleSelect(value: string) {
    if (value === CUSTOM) {
      setCustomChosen(true)
      onChange({ name: "", category: undefined })
      return
    }
    setCustomChosen(false)
    const preset = PAYROLL_ITEM_PRESETS.find(
      (p) => p.label.trim().toLowerCase() === value,
    )
    const opt = options.find((o) => o.key === value)
    if (!opt) return
    onChange({
      name: opt.label,
      category: opt.category,
      cpfable: preset?.cpfable,
    })
  }

  return (
    <div className={cn("flex flex-1 flex-col gap-1.5", className)}>
      <Select value={selectValue} onValueChange={handleSelect}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.length > 0 && (
            <SelectGroup>
              <SelectLabel>Payroll items</SelectLabel>
              {options.map((o) => (
                <SelectItem key={o.key} value={o.key}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          <SelectSeparator />
          <SelectItem value={CUSTOM}>Custom…</SelectItem>
        </SelectContent>
      </Select>

      {isCustom && (
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) =>
              onChange({ name: e.target.value, category })
            }
            placeholder="Item name"
            className="flex-1"
          />
          <Select
            value={category ?? ""}
            onValueChange={(v) =>
              onChange({ name, category: v as Ir8aCategory })
            }
          >
            <SelectTrigger className="w-44 shrink-0">
              <SelectValue placeholder="Classify (IR8A)" />
            </SelectTrigger>
            <SelectContent>
              {IR8A_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {IR8A_CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}
