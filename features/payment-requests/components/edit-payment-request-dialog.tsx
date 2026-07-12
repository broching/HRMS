"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
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
import { getErrorMessage } from "@/lib/errors"
import { COUNTRIES } from "@/lib/countries"
import { CURRENCIES } from "@/features/payment-requests/lib/labels"
import {
  PaymentRequestAttachments,
  type Attachment,
} from "@/features/payment-requests/components/payment-request-attachments"
import { CustomFieldInputs } from "@/features/payment-requests/components/payment-request-fields"

export function EditPaymentRequestDialog({
  requestId,
  open,
  onOpenChange,
}: {
  requestId: Id<"paymentRequests">
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const request = useQuery(
    api.paymentRequests.get,
    open ? { requestId } : "skip",
  )
  const editRequest = useMutation(api.paymentRequests.editRequest)

  const [purpose, setPurpose] = React.useState("")
  const [payeeName, setPayeeName] = React.useState("")
  const [amount, setAmount] = React.useState("")
  const [currency, setCurrency] = React.useState("")
  const [country, setCountry] = React.useState("")
  const [requestDate, setRequestDate] = React.useState("")
  const [fieldValues, setFieldValues] = React.useState<Record<string, string>>({})
  const [attachments, setAttachments] = React.useState<Attachment[]>([])
  const [remarks, setRemarks] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const seeded = React.useRef<string | null>(null)

  // Seed the form once per opened request.
  React.useEffect(() => {
    if (!request || seeded.current === request._id) return
    seeded.current = request._id
    setPurpose(request.purpose)
    setPayeeName(request.payeeName)
    setAmount((request.amountCents / 100).toString())
    setCurrency(request.currency)
    setCountry(request.country ?? "")
    setRequestDate(request.requestDate)
    setFieldValues({ ...(request.fieldValues as Record<string, string>) })
    setRemarks(request.remarks ?? "")
    setAttachments(
      request.attachments.map((a, i) => ({ id: a.storageId, name: `Document ${i + 1}` })),
    )
  }, [request])

  React.useEffect(() => {
    if (!open) seeded.current = null
  }, [open])

  const amountCents = Math.round((Number(amount) || 0) * 100)

  async function save() {
    if (!request) return
    if (!purpose.trim()) return toast.error("Purpose is required.")
    if (!payeeName.trim()) return toast.error("Payee is required.")
    if (amountCents <= 0) return toast.error("Enter a valid amount.")
    for (const f of request.templateFields) {
      if (f.required && !fieldValues[f.key]?.trim())
        return toast.error(`${f.label} is required.`)
    }
    setBusy(true)
    try {
      await editRequest({
        requestId: request._id,
        purpose: purpose.trim(),
        amountCents,
        currency: currency || undefined,
        payeeName: payeeName.trim(),
        country: country || undefined,
        requestDate,
        fieldValues: Object.keys(fieldValues).length ? fieldValues : undefined,
        attachmentStorageIds: attachments.map((a) => a.id),
        remarks: remarks.trim() || undefined,
      })
      toast.success("Saved")
      onOpenChange(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit payment request</DialogTitle>
        </DialogHeader>
        {!request ? (
          <div className="text-muted-foreground py-8 text-center text-sm">Loading…</div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>Date</Label>
              <Input
                type="date"
                value={requestDate}
                onChange={(e) => setRequestDate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Purpose of request</Label>
              <Textarea
                rows={2}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-[1fr_7rem] gap-3">
              <div className="grid gap-2">
                <Label>Amount requested</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Currency</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Account / payee name</Label>
                <Input
                  value={payeeName}
                  onChange={(e) => setPayeeName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label>Country</Label>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <CustomFieldInputs
              fields={request.templateFields}
              values={fieldValues}
              onChange={(k, v) => setFieldValues((s) => ({ ...s, [k]: v }))}
            />
            <div className="grid gap-2">
              <Label>Remarks</Label>
              <Textarea
                rows={2}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Supporting documents</Label>
              <PaymentRequestAttachments value={attachments} onChange={setAttachments} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !request}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
