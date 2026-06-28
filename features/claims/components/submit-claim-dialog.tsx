"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { IconPlus, IconPaperclip, IconX } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FileUpload } from "@/components/shared/file-upload"

const today = () => new Date().toISOString().slice(0, 10)

export function SubmitClaimDialog() {
  const claimTypes = useQuery(api.claimTypes.list, {})
  const submit = useMutation(api.claims.submit)
  const generateUrl = useMutation(api.claims.generateUploadUrl)

  const [open, setOpen] = React.useState(false)
  const [claimTypeId, setClaimTypeId] = React.useState("")
  const [amount, setAmount] = React.useState("")
  const [incurredDate, setIncurredDate] = React.useState(today())
  const [description, setDescription] = React.useState("")
  const [receipts, setReceipts] = React.useState<
    { id: Id<"_storage">; name: string }[]
  >([])
  const [submitting, setSubmitting] = React.useState(false)

  const selected = claimTypes?.find((t) => t._id === claimTypeId)

  function reset() {
    setClaimTypeId("")
    setAmount("")
    setIncurredDate(today())
    setDescription("")
    setReceipts([])
  }

  async function handleSubmit() {
    if (!claimTypeId) return toast.error("Choose a claim type")
    const value = Number(amount)
    if (!value || value <= 0) return toast.error("Enter a valid amount")
    if (!description.trim()) return toast.error("Add a description")
    if (selected?.requiresReceipt && receipts.length === 0)
      return toast.error("This claim type requires a receipt")
    setSubmitting(true)
    try {
      await submit({
        claimTypeId: claimTypeId as Id<"claimTypes">,
        amountCents: Math.round(value * 100),
        incurredDate,
        description: description.trim(),
        receiptStorageIds: receipts.map((r) => r.id),
      })
      toast.success("Claim submitted")
      setOpen(false)
      reset()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <IconPlus className="size-4" />
          Submit a claim
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Submit a claim</DialogTitle>
          <DialogDescription>
            Goes to your manager, then finance for reimbursement.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Claim type</Label>
            <Select value={claimTypeId} onValueChange={setClaimTypeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select claim type" />
              </SelectTrigger>
              <SelectContent>
                {claimTypes?.map((t) => (
                  <SelectItem key={t._id} value={t._id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Amount</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Date incurred</Label>
              <Input
                type="date"
                value={incurredDate}
                max={today()}
                onChange={(e) => setIncurredDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What was this for?"
              rows={2}
            />
          </div>

          <div className="grid gap-2">
            <div className="flex items-center gap-2">
              <FileUpload
                label={
                  selected?.requiresReceipt
                    ? "Add receipt (required)"
                    : "Add receipt"
                }
                generateUrl={generateUrl}
                onUploaded={(id, file) =>
                  setReceipts((r) => [...r, { id, name: file.name }])
                }
              />
              <span className="text-muted-foreground text-xs">
                {receipts.length} attached
              </span>
            </div>
            {receipts.length > 0 && (
              <ul className="flex flex-col gap-1">
                {receipts.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-1 text-xs text-muted-foreground"
                  >
                    <IconPaperclip className="size-3" />
                    <span className="truncate">{r.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setReceipts((rs) => rs.filter((_, j) => j !== i))
                      }
                    >
                      <IconX className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
