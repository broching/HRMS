"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { IconPlus } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { useCurrentMember } from "@/hooks/use-current-member"
import { getErrorMessage } from "@/lib/errors"
import { formatLimit, formatMoney } from "@/features/claims/lib/labels"
import {
  ClaimAttachments,
  type Attachment,
} from "@/features/claims/components/claim-attachments"
import {
  CurrencyConverter,
  conversionResult,
  emptyConversion,
  type ConversionState,
} from "@/features/claims/components/currency-converter"

const today = () => new Date().toISOString().slice(0, 10)
const currentMonth = () => today().slice(0, 7)

export function SubmitClaimDialog({ month }: { month?: string }) {
  // Default the transaction date into the month being worked on (today when
  // that's the current month, otherwise the 1st of the selected month).
  const defaultDate = () =>
    month && month !== currentMonth() ? `${month}-01` : today()
  const claimTypes = useQuery(api.claimTypes.list, {})
  const submit = useMutation(api.claims.submit)
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
  const [conversion, setConversion] = React.useState<ConversionState>(
    emptyConversion(),
  )
  const [taxAmount, setTaxAmount] = React.useState("")
  const [receiptNo, setReceiptNo] = React.useState("")
  const [incurredDate, setIncurredDate] = React.useState(defaultDate())
  const [description, setDescription] = React.useState("")
  const [remarks, setRemarks] = React.useState("")
  const [receipts, setReceipts] = React.useState<Attachment[]>([])
  const [submitting, setSubmitting] = React.useState(false)

  const selected = claimTypes?.find((t) => t._id === claimTypeId)
  const balance = useQuery(
    api.claims.typeBalance,
    claimTypeId ? { claimTypeId: claimTypeId as Id<"claimTypes"> } : "skip",
  )
  // Base currency is the org default (SGD unless changed). Claims are recorded
  // in it; a foreign-currency expense is converted into it.
  const baseCurrency = balance?.currency ?? "SGD"

  const conv = conversionResult(conversion, baseCurrency)
  const amountCents = conversion.enabled
    ? conv.baseAmountCents
    : Math.round((Number(amount) || 0) * 100)

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
  const conversionError = conversion.enabled && !conv.valid ? conv.error : null
  const receiptMissing = !!selected?.requiresReceipt && receipts.length === 0

  function reset() {
    setClaimTypeId("")
    setAmount("")
    setConversion(emptyConversion())
    setTaxAmount("")
    setReceiptNo("")
    setIncurredDate(defaultDate())
    setDescription("")
    setRemarks("")
    setReceipts([])
  }

  function handleOpenChange(o: boolean) {
    if (o) setIncurredDate(defaultDate())
    setOpen(o)
  }

  async function handleSubmit() {
    if (!claimTypeId) return toast.error("Choose a claim type")
    if (conversion.enabled && !conv.valid) {
      return toast.error(conv.error ?? "Complete the currency conversion")
    }
    if (amountCents <= 0) return toast.error("Enter a valid amount")
    if (receiptMissing)
      return toast.error("This claim type requires a receipt")
    if (amountError) return toast.error(amountError)
    setSubmitting(true)
    try {
      await submit({
        claimTypeId: claimTypeId as Id<"claimTypes">,
        amountCents,
        incurredDate,
        description: description.trim(),
        receiptStorageIds: receipts.map((r) => r.id),
        taxAmountCents: taxAmount ? Math.round(Number(taxAmount) * 100) : undefined,
        receiptNo: receiptNo.trim() || undefined,
        remarks: remarks.trim() || undefined,
        ...(conversion.enabled
          ? {
              localAmountCents: conv.localAmountCents,
              localCurrency: conversion.foreignCurrency,
              exchangeRate: conv.exchangeRate,
              exchangeMode: conv.exchangeMode,
              exchangeRateDate: conv.exchangeRateDate,
              exchangeProvider: conv.exchangeProvider,
            }
          : {}),
      })
      toast.success("Draft saved")
      setOpen(false)
      reset()
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't submit your claim"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
            Saved as a draft. Review your month&rsquo;s claims, then use
            &ldquo;Submit all&rdquo; to send them for approval.
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

          {/* Total amount — in the org base currency, unless a foreign currency
              is used (then it's derived from the conversion below). */}
          {!conversion.enabled && (
            <div className="grid gap-2">
              <Label>
                Total amount ({baseCurrency}){" "}
                <span className="text-destructive">*</span>
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
            </div>
          )}

          {/* Foreign-currency toggle + converter */}
          <label className="flex w-fit items-center gap-2 text-sm">
            <Checkbox
              checked={conversion.enabled}
              onCheckedChange={(c) =>
                setConversion({ ...emptyConversion(), enabled: c === true })
              }
            />
            This expense was in another currency
          </label>
          <CurrencyConverter
            baseCurrency={baseCurrency}
            state={conversion}
            onChange={setConversion}
          />
          {conversionError && (
            <p className="text-destructive text-xs">{conversionError}</p>
          )}
          {amountError && (
            <p className="text-destructive text-xs">{amountError}</p>
          )}

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
            <Label>Remarks</Label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Any notes about this claim (optional)"
              rows={2}
            />
          </div>

          <div className="grid gap-2">
            <Label>
              Attachments{" "}
              {selected?.requiresReceipt && (
                <span className="text-destructive">*</span>
              )}
            </Label>
            <ClaimAttachments
              value={receipts}
              onChange={setReceipts}
              required={selected?.requiresReceipt}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              submitting || !!amountError || !!conversionError || receiptMissing
            }
          >
            {submitting ? "Saving…" : "Save draft"}
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
