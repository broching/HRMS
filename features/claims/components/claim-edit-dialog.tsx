"use client"

import * as React from "react"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
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
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getErrorMessage } from "@/lib/errors"
import { formatMoney } from "@/features/claims/lib/labels"
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

type ClaimDoc = FunctionReturnType<typeof api.claims.get>

const today = () => new Date().toISOString().slice(0, 10)

function seedConversion(claim: ClaimDoc): ConversionState {
  if (claim.localCurrency && claim.localAmountCents != null) {
    const mode = claim.exchangeMode ?? "manual"
    return {
      enabled: true,
      foreignCurrency: claim.localCurrency,
      foreignAmount: String(claim.localAmountCents / 100),
      rateMode: mode,
      manualRate:
        mode === "manual" && claim.exchangeRate != null
          ? String(claim.exchangeRate)
          : "",
      auto:
        mode === "auto" && claim.exchangeRate != null
          ? {
              rate: claim.exchangeRate,
              date: claim.exchangeRateDate ?? today(),
              provider: claim.exchangeProvider ?? "frankfurter",
            }
          : null,
    }
  }
  return emptyConversion()
}

// Fetches a claim then opens the edit dialog — for editing directly from a
// table row without first opening the detail view.
export function ClaimEditLauncher({
  claimId,
  open,
  onOpenChange,
}: {
  claimId: Id<"claims"> | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const claim = useQuery(
    api.claims.get,
    open && claimId ? { claimId } : "skip",
  )
  if (!open || !claimId || claim === undefined) return null
  return (
    <ClaimEditDialog
      claim={claim}
      claimId={claimId}
      open={open}
      onOpenChange={onOpenChange}
    />
  )
}

// Approver edit form for a pending claim. Seeds from current values; every save
// is logged server-side with who changed what.
export function ClaimEditDialog({
  claim,
  claimId,
  open,
  onOpenChange,
}: {
  claim: ClaimDoc
  claimId: Id<"claims">
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const editClaim = useMutation(api.claims.editClaim)
  const base = claim.currency
  const isMileage = claim.category === "mileage"
  const mileageSettings = useQuery(
    api.claims.mileageSettingsForClaim,
    isMileage ? { claimId } : "skip",
  )

  const [amount, setAmount] = React.useState(String(claim.amountCents / 100))
  const [conversion, setConversion] = React.useState<ConversionState>(() =>
    seedConversion(claim),
  )
  const [taxAmount, setTaxAmount] = React.useState(
    claim.taxAmountCents != null ? String(claim.taxAmountCents / 100) : "",
  )
  const [receiptNo, setReceiptNo] = React.useState(claim.receiptNo ?? "")
  const [incurredDate, setIncurredDate] = React.useState(claim.incurredDate)
  const [description, setDescription] = React.useState(claim.description)
  const [remarks, setRemarks] = React.useState(claim.remarks ?? "")
  const [attachments, setAttachments] = React.useState<Attachment[]>(
    claim.receipts.map((r, i) => ({ id: r.storageId, name: `Receipt ${i + 1}` })),
  )
  const [mileageDistanceKm, setMileageDistanceKm] = React.useState(
    claim.mileageDistanceKm != null ? String(claim.mileageDistanceKm) : "",
  )
  const [mileageVehicleTypeId, setMileageVehicleTypeId] = React.useState(
    claim.mileageVehicleTypeId ?? "",
  )
  const [busy, setBusy] = React.useState(false)

  const conv = conversionResult(conversion, base)
  const mileageDistanceKmNum = Number(mileageDistanceKm) || 0
  const mileageRatePerKmCents = mileageSettings?.vehicleRates.length
    ? (mileageSettings.vehicleRates.find((v) => v.id === mileageVehicleTypeId)
        ?.ratePerKmCents ?? null)
    : (mileageSettings?.ratePerKmCents ?? null)
  const mileageNeedsVehicle =
    isMileage &&
    (mileageSettings?.vehicleRates.length ?? 0) > 0 &&
    !mileageVehicleTypeId
  const mileageOverMax =
    isMileage &&
    mileageSettings?.maxDistanceKm != null &&
    mileageDistanceKmNum > mileageSettings.maxDistanceKm
  const mileageError = mileageNeedsVehicle
    ? "Choose a vehicle type."
    : mileageOverMax
      ? `Distance exceeds the ${mileageSettings!.maxDistanceKm} km maximum for this office.`
      : null

  const amountCents = isMileage
    ? mileageRatePerKmCents != null
      ? Math.round(mileageDistanceKmNum * mileageRatePerKmCents)
      : 0
    : conversion.enabled
      ? conv.baseAmountCents
      : Math.round((Number(amount) || 0) * 100)
  const conversionError =
    !isMileage && conversion.enabled && !conv.valid ? conv.error : null

  async function onSave() {
    if (!isMileage && conversion.enabled && !conv.valid) {
      return toast.error(conv.error ?? "Complete the currency conversion")
    }
    if (mileageError) return toast.error(mileageError)
    if (amountCents <= 0) return toast.error("Enter a valid amount")
    setBusy(true)
    try {
      await editClaim({
        claimId,
        amountCents,
        description: description.trim(),
        incurredDate,
        taxAmountCents: taxAmount ? Math.round(Number(taxAmount) * 100) : undefined,
        receiptNo: receiptNo.trim() || undefined,
        remarks: remarks.trim() || undefined,
        receiptStorageIds: attachments.map((a) => a.id),
        ...(isMileage
          ? {
              mileageDistanceKm: mileageDistanceKmNum,
              mileageVehicleTypeId: mileageVehicleTypeId || undefined,
            }
          : {}),
        ...(!isMileage && conversion.enabled
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
      toast.success("Claim updated")
      onOpenChange(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't update the claim"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit claim</DialogTitle>
          <DialogDescription>
            Corrections are logged against your name.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Transaction date</Label>
            <Input
              type="date"
              value={incurredDate}
              max={today()}
              onChange={(e) => setIncurredDate(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {isMileage ? (
            <div className="flex flex-col gap-3">
              {mileageSettings && mileageSettings.vehicleRates.length > 0 && (
                <div className="grid gap-2">
                  <Label>Vehicle type</Label>
                  <Select
                    value={mileageVehicleTypeId}
                    onValueChange={setMileageVehicleTypeId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select vehicle type" />
                    </SelectTrigger>
                    <SelectContent>
                      {mileageSettings.vehicleRates.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.label} ({formatMoney(v.ratePerKmCents, base)}/km)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid gap-2">
                <Label>Distance (km)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.1"
                  value={mileageDistanceKm}
                  onChange={(e) => setMileageDistanceKm(e.target.value)}
                />
                {mileageSettings?.maxDistanceKm != null && (
                  <p className="text-muted-foreground text-xs">
                    Max {mileageSettings.maxDistanceKm} km per claim.
                  </p>
                )}
              </div>
              {mileageRatePerKmCents != null && (
                <div className="bg-muted/50 flex items-center justify-between rounded-lg p-3 text-sm">
                  <span className="text-muted-foreground">
                    {formatMoney(mileageRatePerKmCents, base)}/km ×{" "}
                    {mileageDistanceKmNum || 0} km
                  </span>
                  <span className="font-semibold">
                    {formatMoney(amountCents, base)}
                  </span>
                </div>
              )}
              {mileageError && (
                <p className="text-destructive text-xs">{mileageError}</p>
              )}
            </div>
          ) : (
            <>
              {!conversion.enabled && (
                <div className="grid gap-2">
                  <Label>Total amount ({base})</Label>
                  <div className="relative">
                    <span className="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2 text-sm">
                      {base}
                    </span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="pl-12"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <label className="flex w-fit items-center gap-2 text-sm">
                <Checkbox
                  checked={conversion.enabled}
                  onCheckedChange={(c) =>
                    setConversion(
                      c === true
                        ? { ...emptyConversion(), enabled: true }
                        : emptyConversion(),
                    )
                  }
                />
                This expense was in another currency
              </label>
              <CurrencyConverter
                baseCurrency={base}
                state={conversion}
                onChange={setConversion}
              />
              {conversionError && (
                <p className="text-destructive text-xs">{conversionError}</p>
              )}
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            {!isMileage && (
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
            )}
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
              placeholder="Notes about this claim (optional)"
              rows={2}
            />
          </div>

          <div className="grid gap-2">
            <Label>Attachments</Label>
            <ClaimAttachments value={attachments} onChange={setAttachments} />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={busy || !!conversionError || !!mileageError}
          >
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
