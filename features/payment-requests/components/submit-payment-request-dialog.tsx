"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { IconPlus, IconSignature, IconCheck } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
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
  DialogTrigger,
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
import { SignatureCaptureDialog } from "@/features/payroll/components/signature-pad"
import {
  PaymentRequestAttachments,
  type Attachment,
} from "@/features/payment-requests/components/payment-request-attachments"
import { CustomFieldInputs } from "@/features/payment-requests/components/payment-request-fields"
import {
  PaymentRequestItemsEditor,
  type ItemDraft,
  emptyItem,
  itemsTotalCents,
  toPayloadItems,
  firstInvalidItem,
} from "@/features/payment-requests/components/payment-request-items"

const today = () => new Date().toISOString().slice(0, 10)

export function SubmitPaymentRequestDialog({ month }: { month?: string }) {
  const defaultDate = () => {
    const cm = today().slice(0, 7)
    return month && month !== cm ? `${month}-01` : today()
  }
  const templates = useQuery(api.paymentRequestTemplates.list, {})
  const myCurrency = useQuery(api.claims.myBaseCurrency, {})
  const org = useQuery(api.organizations.current)
  const create = useMutation(api.paymentRequests.create)

  const activeTemplates = React.useMemo(
    () => (templates ?? []).filter((t) => t.active),
    [templates],
  )

  const [open, setOpen] = React.useState(false)
  const [templateId, setTemplateId] = React.useState<string>("")
  const [purpose, setPurpose] = React.useState("")
  const [payeeName, setPayeeName] = React.useState("")
  const [amount, setAmount] = React.useState("")
  const [multiItem, setMultiItem] = React.useState(false)
  const [items, setItems] = React.useState<ItemDraft[]>([])
  const [currency, setCurrency] = React.useState("")
  const [country, setCountry] = React.useState("")
  const [requestDate, setRequestDate] = React.useState(defaultDate())
  const [fieldValues, setFieldValues] = React.useState<Record<string, string>>({})
  const [attachments, setAttachments] = React.useState<Attachment[]>([])
  const [remarks, setRemarks] = React.useState("")
  const [signatureId, setSignatureId] = React.useState<Id<"_storage"> | null>(null)
  const [sigOpen, setSigOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const generateUpload = useMutation(api.paymentRequests.generateUploadUrl)

  // Default the template to the org default (or first) and currency to the
  // employee base currency, once loaded.
  React.useEffect(() => {
    if (!templateId && activeTemplates.length > 0) {
      const def = activeTemplates.find((t) => t.isDefault) ?? activeTemplates[0]
      setTemplateId(def._id)
    }
  }, [activeTemplates, templateId])
  React.useEffect(() => {
    if (!currency && myCurrency?.currency) setCurrency(myCurrency.currency)
  }, [myCurrency, currency])
  React.useEffect(() => {
    if (!country && org?.country) setCountry(org.country)
  }, [org, country])

  const template = activeTemplates.find((t) => t._id === templateId)
  const amountCents = multiItem
    ? itemsTotalCents(items)
    : Math.round((Number(amount) || 0) * 100)
  const noTemplates = templates !== undefined && activeTemplates.length === 0

  // Turning the multi-item switch on seeds a first blank item; turning it off
  // drops them so the single amount takes over again.
  function toggleMultiItem(on: boolean) {
    setMultiItem(on)
    if (on && items.length === 0) setItems([emptyItem()])
    if (!on) setItems([])
  }

  function reset() {
    setPurpose("")
    setPayeeName("")
    setAmount("")
    setMultiItem(false)
    setItems([])
    setRequestDate(defaultDate())
    setCountry(org?.country ?? "")
    setFieldValues({})
    setAttachments([])
    setRemarks("")
    setSignatureId(null)
  }

  function missingRequiredField(): string | null {
    if (!purpose.trim()) return "Purpose of request is required."
    if (!payeeName.trim()) return "Payee / account name is required."
    if (multiItem) {
      const withDesc = items.filter((it) => it.description.trim() !== "")
      if (withDesc.length === 0) return "Add at least one item."
      const bad = firstInvalidItem(withDesc)
      if (bad >= 0) return `Item ${bad + 1} needs a description, quantity and price.`
    } else if (amountCents <= 0) {
      return "Enter a valid amount."
    }
    for (const f of template?.fields ?? []) {
      if (f.required && !fieldValues[f.key]?.trim()) return `${f.label} is required.`
    }
    return null
  }

  async function handleSubmit(andSubmit: boolean) {
    const err = missingRequiredField()
    if (err) return toast.error(err)
    setBusy(true)
    try {
      await create({
        templateId: (templateId as Id<"paymentRequestTemplates">) || undefined,
        purpose: purpose.trim(),
        amountCents,
        currency: currency || undefined,
        payeeName: payeeName.trim(),
        items: multiItem ? toPayloadItems(items) : undefined,
        country: country || undefined,
        requestDate,
        fieldValues: Object.keys(fieldValues).length ? fieldValues : undefined,
        attachmentStorageIds: attachments.map((a) => a.id),
        remarks: remarks.trim() || undefined,
        requestorSignatureStorageId: signatureId ?? undefined,
        andSubmit,
      })
      toast.success(andSubmit ? "Payment request submitted" : "Draft saved")
      setOpen(false)
      reset()
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save the payment request"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : setOpen(false))}>
      <DialogTrigger asChild>
        <Button>
          <IconPlus className="size-4" />
          New request
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>New payment request</DialogTitle>
          <DialogDescription>
            Raise a request for payment. Attach supporting documents (invoices,
            quotes), then submit for approval.
          </DialogDescription>
        </DialogHeader>

        {noTemplates ? (
          <div className="bg-muted/50 rounded-lg border p-3 text-sm">
            <p className="text-muted-foreground">
              No payment-request templates have been set up yet. Ask an admin to
              configure one in HR Lounge → Payment Requests → Settings.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {activeTemplates.length > 1 && (
              <div className="grid gap-2">
                <Label>Template</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeTemplates.map((t) => (
                      <SelectItem key={t._id} value={t._id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-2">
              <Label>
                Date <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={requestDate}
                onChange={(e) => setRequestDate(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label>
                Purpose of request <span className="text-destructive">*</span>
              </Label>
              <Textarea
                rows={2}
                placeholder="Ex. Purchase of office furniture for Malaysia office"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
              />
            </div>

            <div className="grid gap-3">
              <div className="bg-muted/40 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
                <div className="grid gap-0.5">
                  <Label htmlFor="pr-multi-item" className="cursor-pointer">
                    Multiple Items 
                  </Label>
                  <span className="text-muted-foreground text-xs">
                    List several items and total them automatically
                  </span>
                </div>
                <Switch
                  id="pr-multi-item"
                  checked={multiItem}
                  onCheckedChange={toggleMultiItem}
                />
              </div>

              {multiItem ? (
                <div className="grid gap-3">
                  <div className="grid max-w-[10rem] gap-2">
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
                  <PaymentRequestItemsEditor
                    items={items}
                    currency={currency}
                    onChange={setItems}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-[1fr_7rem] gap-3">
                  <div className="grid gap-2">
                    <Label>
                      Amount requested <span className="text-destructive">*</span>
                    </Label>
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
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>
                  Account / payee name{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="Ex. MUHAMMAD FALIKH BIN FISAL"
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
              fields={template?.fields ?? []}
              values={fieldValues}
              onChange={(k, v) => setFieldValues((s) => ({ ...s, [k]: v }))}
            />

            <div className="grid gap-2">
              <Label>Remarks</Label>
              <Textarea
                rows={2}
                placeholder="Any notes about this request (optional)"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label>Supporting documents</Label>
              <PaymentRequestAttachments
                value={attachments}
                onChange={setAttachments}
              />
            </div>

            {template?.show?.requestorSignature !== false && (
            <div className="grid gap-2">
              <Label>Your signature (optional)</Label>
              {signatureId ? (
                <div className="flex items-center gap-2 text-sm">
                  <IconCheck className="size-4 text-emerald-600" />
                  <span className="text-muted-foreground">Signature added</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSignatureId(null)}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={() => setSigOpen(true)}
                >
                  <IconSignature className="size-4" />
                  Add signature
                </Button>
              )}
            </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            className="flex-1 sm:flex-none"
            onClick={() => handleSubmit(false)}
            disabled={busy || noTemplates}
          >
            Save draft
          </Button>
          <Button
            className="flex-1 sm:flex-none"
            onClick={() => handleSubmit(true)}
            disabled={busy || noTemplates}
          >
            {busy ? "Saving…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <SignatureCaptureDialog
        open={sigOpen}
        onOpenChange={setSigOpen}
        title="Your signature"
        description="Signs the request as 'Requested by' on the printed document."
        getUploadUrl={() => generateUpload()}
        onSigned={async (storageId) => {
          setSignatureId(storageId as Id<"_storage">)
        }}
      />
    </Dialog>
  )
}
