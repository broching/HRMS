"use client"

import * as React from "react"
import { IconPlus, IconTrash } from "@tabler/icons-react"
import type { PaymentRequestItem } from "@/convex/lib/enums"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatMoney } from "@/features/payment-requests/lib/labels"

// A line item as edited in the form. Quantity + unit price are kept as raw
// strings so the inputs stay controlled while someone is typing (a half-typed
// "1." shouldn't snap back to a number). Converted to cents on submit.
export type ItemDraft = {
  key: string
  description: string
  quantity: string
  unitPrice: string
}

let seq = 0
export function emptyItem(): ItemDraft {
  seq += 1
  return { key: `it-${Date.now()}-${seq}`, description: "", quantity: "1", unitPrice: "" }
}

// Cents for one line: quantity × unit price. Non-numeric parts count as 0.
export function lineCents(item: ItemDraft): number {
  const qty = Number(item.quantity)
  const unit = Math.round((Number(item.unitPrice) || 0) * 100)
  if (!Number.isFinite(qty) || qty <= 0 || unit < 0) return 0
  return Math.round(qty * unit)
}

export function itemsTotalCents(items: ItemDraft[]): number {
  return items.reduce((sum, it) => sum + lineCents(it), 0)
}

// Shape the drafts into the mutation payload. Empty rows (no description) drop.
export function toPayloadItems(items: ItemDraft[]): PaymentRequestItem[] {
  return items
    .filter((it) => it.description.trim() !== "")
    .map((it) => {
      const quantity = Number(it.quantity) || 0
      const unitPriceCents = Math.round((Number(it.unitPrice) || 0) * 100)
      return {
        description: it.description.trim(),
        quantity,
        unitPriceCents,
        amountCents: Math.round(quantity * unitPriceCents),
      }
    })
}

// Seed the editor from a saved request's items (for the edit form).
export function fromPayloadItems(items: PaymentRequestItem[]): ItemDraft[] {
  return items.map((it) => {
    seq += 1
    return {
      key: `it-${seq}`,
      description: it.description,
      quantity: String(it.quantity),
      unitPrice: (it.unitPriceCents / 100).toString(),
    }
  })
}

// First blank item, or the first row that has a description missing amount — used
// to surface a validation hint from the parent.
export function firstInvalidItem(items: ItemDraft[]): number {
  return items.findIndex(
    (it) => it.description.trim() === "" || lineCents(it) <= 0,
  )
}

// Mobile-first itemised editor. Each item is a self-contained card: description
// spans the width, then quantity × unit price with the line total called out.
// Cards stack cleanly on a phone and sit two-up from `sm`.
export function PaymentRequestItemsEditor({
  items,
  currency,
  onChange,
}: {
  items: ItemDraft[]
  currency: string
  onChange: (items: ItemDraft[]) => void
}) {
  const cur = currency || "SGD"
  const update = (key: string, patch: Partial<ItemDraft>) =>
    onChange(items.map((it) => (it.key === key ? { ...it, ...patch } : it)))
  const remove = (key: string) =>
    onChange(items.filter((it) => it.key !== key))
  const total = itemsTotalCents(items)

  return (
    <div className="grid gap-3">
      <div className="grid gap-3">
        {items.map((it, i) => (
          <div
            key={it.key}
            className="bg-muted/30 grid gap-3 rounded-lg border p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-muted-foreground text-xs font-medium">
                Item {i + 1}
              </span>
              <button
                type="button"
                aria-label={`Remove item ${i + 1}`}
                className="text-muted-foreground hover:text-destructive -mt-1 -mr-1 rounded p-1 disabled:opacity-40"
                disabled={items.length === 1}
                onClick={() => remove(it.key)}
              >
                <IconTrash className="size-4" />
              </button>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs" htmlFor={`${it.key}-desc`}>
                Description
              </Label>
              <Input
                id={`${it.key}-desc`}
                placeholder="Ex. Ergonomic office chair"
                value={it.description}
                onChange={(e) => update(it.key, { description: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-[4.5rem_1fr] items-end gap-2 sm:grid-cols-[5rem_1fr_auto]">
              <div className="grid gap-1.5">
                <Label className="text-xs" htmlFor={`${it.key}-qty`}>
                  Qty
                </Label>
                <Input
                  id={`${it.key}-qty`}
                  type="number"
                  min="0"
                  step="1"
                  inputMode="decimal"
                  value={it.quantity}
                  onChange={(e) => update(it.key, { quantity: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs" htmlFor={`${it.key}-unit`}>
                  Unit price ({cur})
                </Label>
                <Input
                  id={`${it.key}-unit`}
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={it.unitPrice}
                  onChange={(e) => update(it.key, { unitPrice: e.target.value })}
                />
              </div>
              <div className="col-span-2 flex items-center justify-between border-t pt-2 sm:col-span-1 sm:min-w-[7rem] sm:flex-col sm:items-end sm:justify-end sm:border-t-0 sm:pt-0">
                <span className="text-muted-foreground text-xs sm:hidden">
                  Line total
                </span>
                <span className="font-semibold tabular-nums">
                  {formatMoney(lineCents(it), cur)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...items, emptyItem()])}
        >
          <IconPlus className="size-4" />
          Add item
        </Button>
        <div className="text-right">
          <div className="text-muted-foreground text-xs">Total</div>
          <div className="text-lg font-semibold tabular-nums">
            {formatMoney(total, cur)}
          </div>
        </div>
      </div>
    </div>
  )
}
