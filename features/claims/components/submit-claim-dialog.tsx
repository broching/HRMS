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
import { useCurrentMember } from "@/hooks/use-current-member"
import { getErrorMessage } from "@/lib/errors"
import { CURRENCIES, formatLimit, formatMoney } from "@/features/claims/lib/labels"

const today = () => new Date().toISOString().slice(0, 10)

export function SubmitClaimDialog() {
  const claimTypes = useQuery(api.claimTypes.list, {})
  const submit = useMutation(api.claims.submit)
  const generateUrl = useMutation(api.claims.generateUploadUrl)
  const seedDefaults = useMutation(api.claimTypes.seedDefaults)
  const member = useCurrentMember()
  const isFinance = member?.role === "admin" || member?.role === "hr"
  const noTypes = claimTypes !== undefined && claimTypes.length === 0

  async function handleSeed() {
    try {
      await seedDefaults({})
      toast.success("Default claim types added")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't add default claim types"))
    }
  }

  const [open, setOpen] = React.useState(false)
  const [claimTypeId, setClaimTypeId] = React.useState("")
  const [amount, setAmount] = React.useState("")
  const [localAmount, setLocalAmount] = React.useState("")
  const [localCurrency, setLocalCurrency] = React.useState("")
  const [taxAmount, setTaxAmount] = React.useState("")
  const [receiptNo, setReceiptNo] = React.useState("")
  const [incurredDate, setIncurredDate] = React.useState(today())
  const [description, setDescription] = React.useState("")
  const [receipts, setReceipts] = React.useState<
    { id: Id<"_storage">; name: string }[]
  >([])
  const [submitting, setSubmitting] = React.useState(false)

  const selected = claimTypes?.find((t) => t._id === claimTypeId)
  const balance = useQuery(
    api.claims.typeBalance,
    claimTypeId ? { claimTypeId: claimTypeId as Id<"claimTypes"> } : "skip",
  )
  const baseCurrency = balance?.currency ?? "SGD"

  const amountCents = Math.round((Number(amount) || 0) * 100)
  const perTxnLimit = balance?.perTransactionLimitCents ?? null
  const overPerTxn = perTxnLimit != null && amountCents > perTxnLimit
  const overBalance =
    balance?.availableCents != null && amountCents > balance.availableCents

  // Validate against the claim type's limits up front, so the same rules the
  // server enforces surface as a clear inline message instead of a raw error.
  const amountError =
    amountCents <= 0
      ? null
      : overPerTxn
        ? `Amount exceeds the ${formatMoney(perTxnLimit!, baseCurrency)} per-transaction limit for this claim type.`
        : overBalance
          ? `Amount exceeds the ${formatMoney(balance!.availableCents!, baseCurrency)} balance available for this claim type.`
          : null
  const receiptMissing = !!selected?.requiresReceipt && receipts.length === 0

  function reset() {
    setClaimTypeId("")
    setAmount("")
    setLocalAmount("")
    setLocalCurrency("")
    setTaxAmount("")
    setReceiptNo("")
    setIncurredDate(today())
    setDescription("")
    setReceipts([])
  }

  async function handleSubmit() {
    if (!claimTypeId) return toast.error("Choose a claim type")
    const value = Number(amount)
    if (!value || value <= 0) return toast.error("Enter a valid amount")
    if (receiptMissing)
      return toast.error("This claim type requires a receipt")
    if (amountError) return toast.error(amountError)
    setSubmitting(true)
    try {
      await submit({
        claimTypeId: claimTypeId as Id<"claimTypes">,
        amountCents: Math.round(value * 100),
        incurredDate,
        description: description.trim(),
        receiptStorageIds: receipts.map((r) => r.id),
        taxAmountCents: taxAmount ? Math.round(Number(taxAmount) * 100) : undefined,
        localAmountCents: localAmount
          ? Math.round(Number(localAmount) * 100)
          : undefined,
        localCurrency: localAmount && localCurrency ? localCurrency : undefined,
        receiptNo: receiptNo.trim() || undefined,
      })
      toast.success("Claim submitted")
      setOpen(false)
      reset()
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't submit your claim"))
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New claim</DialogTitle>
          <DialogDescription>
            Routed through your organisation&rsquo;s claim approval workflow.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>
              Transaction date <span className="text-destructive">*</span>
            </Label>
            <Input
              type="date"
              value={incurredDate}
              max={today()}
              onChange={(e) => setIncurredDate(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label>
              Claim type <span className="text-destructive">*</span>
            </Label>
            {noTypes ? (
              <div className="bg-muted/50 flex flex-col gap-2 rounded-lg border p-3 text-sm">
                <p className="text-muted-foreground">
                  No claim types have been set up yet.
                </p>
                {isFinance ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={handleSeed}
                  >
                    Add default claim types
                  </Button>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Ask an HR admin to configure claim types in Settings → Claim
                    Types.
                  </p>
                )}
              </div>
            ) : (
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
            )}
          </div>

          <div className="grid gap-2">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex. Entertainment for client"
            />
          </div>

          {/* Claim-type info card: guidelines, limits and live balance */}
          {selected && balance && (
            <div className="bg-muted/50 flex flex-col gap-3 rounded-lg p-3 text-sm">
              <div>
                <p className="font-medium">{selected.name}</p>
                {balance.guidelines && (
                  <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                    {balance.guidelines}
                  </p>
                )}
              </div>
              <dl className="grid gap-1.5">
                <LimitRow
                  label="Yearly"
                  value={`${formatMoney(balance.yearlyUsedCents, balance.currency)} / ${formatLimit(balance.yearlyLimitCents, balance.currency)}`}
                />
                <LimitRow
                  label="Monthly"
                  value={`${formatMoney(balance.monthlyUsedCents, balance.currency)} / ${formatLimit(balance.monthlyLimitCents, balance.currency)}`}
                />
                <LimitRow
                  label="Transaction"
                  value={formatLimit(
                    balance.perTransactionLimitCents,
                    balance.currency,
                  )}
                />
                <div className="mt-1 flex items-center justify-between border-t pt-2">
                  <dt className="font-medium">Balance available to claim</dt>
                  <dd className="font-semibold text-emerald-600">
                    {balance.availableCents === null
                      ? "No limit"
                      : formatMoney(balance.availableCents, balance.currency)}
                  </dd>
                </div>
              </dl>
            </div>
          )}

          <div className="grid gap-2">
            <Label>
              Total amount <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <span className="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2 text-sm">
                {baseCurrency}
              </span>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                className="pl-12"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            {amountError && (
              <p className="text-destructive text-xs">{amountError}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Amount in local currency</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={localAmount}
                onChange={(e) => setLocalAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Currency</Label>
              <Select value={localCurrency} onValueChange={setLocalCurrency}>
                <SelectTrigger>
                  <SelectValue placeholder="Select currency" />
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

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Tax amount</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={taxAmount}
                onChange={(e) => setTaxAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>Receipt No</Label>
              <Input
                value={receiptNo}
                onChange={(e) => setReceiptNo(e.target.value)}
                placeholder="Optional"
              />
            </div>
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
                    className="text-muted-foreground flex items-center gap-1 text-xs"
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
          <Button
            onClick={handleSubmit}
            disabled={submitting || !!amountError || receiptMissing}
          >
            {submitting ? "Submitting…" : "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LimitRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}
