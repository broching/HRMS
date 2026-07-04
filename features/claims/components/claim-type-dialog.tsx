"use client"

import * as React from "react"
import { useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { ClaimCategory } from "@/convex/lib/enums"
import { getErrorMessage } from "@/lib/errors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CLAIM_CATEGORY_LABELS } from "@/features/claims/lib/labels"

type ClaimType = FunctionReturnType<typeof api.claimTypes.list>[number]

const CATEGORIES = Object.keys(CLAIM_CATEGORY_LABELS) as ClaimCategory[]

const dollars = (cents?: number) =>
  cents === undefined ? "" : String(cents / 100)
const toCents = (s: string) =>
  s.trim() ? Math.round(Number(s) * 100) : undefined

export function ClaimTypeDialog({
  open,
  onOpenChange,
  claimType,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  claimType?: ClaimType
}) {
  const create = useMutation(api.claimTypes.create)
  const update = useMutation(api.claimTypes.update)
  const isEdit = !!claimType

  const [name, setName] = React.useState("")
  const [category, setCategory] = React.useState<ClaimCategory>("custom")
  const [guidelines, setGuidelines] = React.useState("")
  const [requiresReceipt, setRequiresReceipt] = React.useState(true)
  const [maxAmount, setMaxAmount] = React.useState("")
  const [yearlyLimit, setYearlyLimit] = React.useState("")
  const [monthlyLimit, setMonthlyLimit] = React.useState("")
  const [glCode, setGlCode] = React.useState("")
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    setName(claimType?.name ?? "")
    setCategory(claimType?.category ?? "custom")
    setGuidelines(claimType?.guidelines ?? "")
    setRequiresReceipt(claimType?.requiresReceipt ?? true)
    setMaxAmount(dollars(claimType?.maxAmountCents))
    setYearlyLimit(dollars(claimType?.yearlyLimitCents))
    setMonthlyLimit(dollars(claimType?.monthlyLimitCents))
    setGlCode(claimType?.glCode ?? "")
  }, [open, claimType])

  async function save() {
    if (!name.trim()) return toast.error("Give the claim type a name.")
    setSaving(true)
    try {
      const fields = {
        name: name.trim(),
        requiresReceipt,
        guidelines: guidelines.trim() || undefined,
        maxAmountCents: toCents(maxAmount),
        yearlyLimitCents: toCents(yearlyLimit),
        monthlyLimitCents: toCents(monthlyLimit),
        glCode: glCode.trim() || undefined,
      }
      if (isEdit) {
        await update({ id: claimType._id, ...fields })
      } else {
        await create({ category, ...fields })
      }
      toast.success(isEdit ? "Claim type updated" : "Claim type created")
      onOpenChange(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save this claim type"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit claim type" : "New claim type"}</DialogTitle>
          <DialogDescription>
            Set the guidelines and spending limits employees see when claiming.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. Medical — Outpatient"
            />
          </div>

          <div className="grid gap-2">
            <Label>Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as ClaimCategory)}
              disabled={isEdit}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CLAIM_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Guidelines</Label>
            <Textarea
              rows={3}
              value={guidelines}
              onChange={(e) => setGuidelines(e.target.value)}
              placeholder="What can be claimed under this type, and any conditions."
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label className="text-xs">Per transaction</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="No limit"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Monthly</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="No limit"
                value={monthlyLimit}
                onChange={(e) => setMonthlyLimit(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label className="text-xs">Yearly</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="No limit"
                value={yearlyLimit}
                onChange={(e) => setYearlyLimit(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>GL code</Label>
              <Input
                value={glCode}
                onChange={(e) => setGlCode(e.target.value)}
                placeholder="Optional"
              />
            </div>
            <div className="flex items-center justify-between gap-2 rounded-md border px-3">
              <Label className="text-sm">Requires receipt</Label>
              <Switch
                checked={requiresReceipt}
                onCheckedChange={setRequiresReceipt}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
