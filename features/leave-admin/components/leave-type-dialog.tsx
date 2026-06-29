"use client"

import * as React from "react"
import { useMutation } from "convex/react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { LeaveCategory } from "@/convex/lib/enums"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
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

const CATEGORIES: { value: LeaveCategory; label: string }[] = [
  { value: "annual", label: "Annual" },
  { value: "sick", label: "Sick" },
  { value: "hospitalisation", label: "Hospitalisation" },
  { value: "childcare", label: "Childcare" },
  { value: "maternity", label: "Maternity" },
  { value: "paternity", label: "Paternity" },
  { value: "unpaid", label: "Unpaid" },
  { value: "custom", label: "Custom" },
]

export function LeaveTypeDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const create = useMutation(api.leaveTypes.create)
  const [name, setName] = React.useState("")
  const [code, setCode] = React.useState("")
  const [category, setCategory] = React.useState<LeaveCategory>("custom")
  const [color, setColor] = React.useState("#3b82f6")
  const [days, setDays] = React.useState("14")
  const [paid, setPaid] = React.useState(true)
  const [allowHalfDay, setAllowHalfDay] = React.useState(true)
  const [requiresApproval, setRequiresApproval] = React.useState(true)
  const [requiresAttachment, setRequiresAttachment] = React.useState(false)
  const [allowCarryForward, setAllowCarryForward] = React.useState(false)
  const [isCredit, setIsCredit] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  function reset() {
    setName("")
    setCode("")
    setCategory("custom")
    setColor("#3b82f6")
    setDays("14")
    setPaid(true)
    setAllowHalfDay(true)
    setRequiresApproval(true)
    setRequiresAttachment(false)
    setAllowCarryForward(false)
    setIsCredit(false)
  }

  async function handleCreate() {
    if (!name.trim()) return toast.error("Enter a name")
    if (!code.trim()) return toast.error("Enter a short code")
    setBusy(true)
    try {
      await create({
        name: name.trim(),
        code: code.trim().toUpperCase(),
        category,
        paid,
        defaultEntitlementDays: Number(days) || 0,
        accrualMethod: "none",
        allowCarryForward,
        allowHalfDay,
        requiresAttachment,
        requiresApproval,
        color,
        isCredit,
      })
      toast.success("Leave type created")
      reset()
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New leave type</DialogTitle>
          <DialogDescription>
            A default &ldquo;All Employees&rdquo; policy is created automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-[1fr_100px] gap-3">
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Compassionate Leave"
              />
            </div>
            <div className="grid gap-2">
              <Label>Code</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="CL"
              />
            </div>
          </div>
          <div className="grid grid-cols-[1fr_80px] gap-3">
            <div className="grid gap-2">
              <Label>Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as LeaveCategory)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Colour</Label>
              <Input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 p-1"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Default entitlement (days / year)</Label>
            <Input
              type="number"
              min="0"
              step="0.5"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-3 rounded-lg border p-3">
            <ToggleRow label="Paid leave" checked={paid} onChange={setPaid} />
            <ToggleRow
              label="Allow half-day"
              checked={allowHalfDay}
              onChange={setAllowHalfDay}
            />
            <ToggleRow
              label="Requires approval"
              checked={requiresApproval}
              onChange={setRequiresApproval}
            />
            <ToggleRow
              label="Requires attachment"
              checked={requiresAttachment}
              onChange={setRequiresAttachment}
            />
            <ToggleRow
              label="Allow carry-forward"
              checked={allowCarryForward}
              onChange={setAllowCarryForward}
            />
            <ToggleRow
              label="Credit type (earned by working)"
              checked={isCredit}
              onChange={setIsCredit}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={busy}>
            {busy ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between text-sm">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  )
}
