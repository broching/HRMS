"use client"

import { getErrorMessage } from "@/lib/errors"
import * as React from "react"
import { useAction } from "convex/react"
import { IconRefresh } from "@tabler/icons-react"
import { Loader2 } from "lucide-react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { CURRENCIES, formatMoney } from "@/features/claims/lib/labels"

const today = () => new Date().toISOString().slice(0, 10)

export type ConversionState = {
  enabled: boolean
  foreignCurrency: string
  foreignAmount: string
  rateMode: "manual" | "auto"
  manualRate: string
  // Last auto-fetched rate (locked at submit). Null until fetched.
  auto: { rate: number; date: string; provider: string } | null
}

export function emptyConversion(): ConversionState {
  return {
    enabled: false,
    foreignCurrency: "",
    foreignAmount: "",
    rateMode: "auto",
    manualRate: "",
    auto: null,
  }
}

export type ConversionResult = {
  valid: boolean
  error: string | null
  rate: number | null
  baseAmountCents: number
  localAmountCents: number
  exchangeRate: number
  exchangeMode: "manual" | "auto"
  exchangeRateDate: string
  exchangeProvider: string
}

// Pure derivation of the converted base-currency amount + exchange metadata for
// submission, shared by the form (to preview) and the submit handler.
export function conversionResult(
  s: ConversionState,
  _baseCurrency: string,
): ConversionResult {
  const foreign = Number(s.foreignAmount)
  const rate =
    s.rateMode === "auto" ? (s.auto?.rate ?? null) : Number(s.manualRate) || null
  const localAmountCents = Math.round((foreign || 0) * 100)
  const baseAmountCents =
    rate != null ? Math.round((foreign || 0) * rate * 100) : 0
  let error: string | null = null
  if (!s.foreignCurrency) error = "Choose the currency of the expense."
  else if (!(foreign > 0)) error = "Enter the amount in the foreign currency."
  else if (!(rate != null && rate > 0))
    error =
      s.rateMode === "auto"
        ? "Fetch the exchange rate, or switch to manual."
        : "Enter a valid exchange rate."
  return {
    valid: error === null,
    error,
    rate,
    baseAmountCents,
    localAmountCents,
    exchangeRate: rate ?? 0,
    exchangeMode: s.rateMode,
    exchangeRateDate: s.rateMode === "auto" ? (s.auto?.date ?? today()) : today(),
    exchangeProvider: s.rateMode === "auto" ? (s.auto?.provider ?? "frankfurter") : "manual",
  }
}

// Foreign-currency conversion sub-form. The claim's base amount is derived from
// the foreign amount × exchange rate. In "auto" mode the rate is fetched live
// (Frankfurter) for today and locked; in "manual" mode the user types it.
export function CurrencyConverter({
  baseCurrency,
  state,
  onChange,
}: {
  baseCurrency: string
  state: ConversionState
  onChange: (next: ConversionState) => void
}) {
  const getRate = useAction(api.exchange.getRate)
  const [loading, setLoading] = React.useState(false)
  const [rateError, setRateError] = React.useState<string | null>(null)

  const patch = React.useCallback(
    (p: Partial<ConversionState>) => onChange({ ...state, ...p }),
    [onChange, state],
  )

  const { foreignCurrency, rateMode, enabled } = state

  // Keep the latest state/onChange in a ref so the async rate fetch merges into
  // the current state rather than a stale closure (which would revert the
  // currency the user just picked).
  const latest = React.useRef({ state, onChange })
  latest.current = { state, onChange }

  const fetchRate = React.useCallback(
    async (from: string) => {
      if (!from || from === baseCurrency) return
      setLoading(true)
      setRateError(null)
      try {
        const res = await getRate({ from, to: baseCurrency, date: today() })
        latest.current.onChange({ ...latest.current.state, auto: res })
      } catch (e) {
        setRateError(getErrorMessage(e, "Couldn't fetch rate."))
        latest.current.onChange({ ...latest.current.state, auto: null })
      } finally {
        setLoading(false)
      }
    },
    [baseCurrency, getRate],
  )

  // Auto-fetch when in auto mode with a chosen currency but no rate yet. Only
  // fires when `auto` is null, so a rate locked at submit (seeded when editing)
  // is preserved until the currency is changed (which resets `auto`).
  const needsRate = state.auto === null
  React.useEffect(() => {
    if (
      enabled &&
      rateMode === "auto" &&
      foreignCurrency &&
      foreignCurrency !== baseCurrency &&
      needsRate
    ) {
      fetchRate(foreignCurrency)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, rateMode, foreignCurrency, baseCurrency, needsRate])

  if (!state.enabled) return null

  const result = conversionResult(state, baseCurrency)
  const foreignOpts = CURRENCIES.filter((c) => c !== baseCurrency)

  return (
    <div className="border-primary/30 bg-muted/40 flex flex-col gap-3 rounded-lg border p-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs">Expense currency</Label>
          <Select
            value={foreignCurrency}
            onValueChange={(v) => patch({ foreignCurrency: v, auto: null })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Currency" />
            </SelectTrigger>
            <SelectContent>
              {foreignOpts.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">Amount ({foreignCurrency || "foreign"})</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={state.foreignAmount}
            onChange={(e) => patch({ foreignAmount: e.target.value })}
          />
        </div>
      </div>

      {/* Manual / Auto mode toggle */}
      <div className="flex gap-1 rounded-md border p-0.5">
        {(["auto", "manual"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => patch({ rateMode: m })}
            className={cn(
              "flex-1 rounded px-2 py-1 text-xs font-medium capitalize",
              rateMode === m
                ? "bg-background shadow-sm"
                : "text-muted-foreground",
            )}
          >
            {m === "auto" ? "Auto (live rate)" : "Manual rate"}
          </button>
        ))}
      </div>

      {rateMode === "manual" ? (
        <div className="grid gap-1.5">
          <Label className="text-xs">
            Exchange rate (1 {foreignCurrency || "?"} = ? {baseCurrency})
          </Label>
          <Input
            type="number"
            min="0"
            step="0.0001"
            placeholder="e.g. 1.35"
            value={state.manualRate}
            onChange={(e) => patch({ manualRate: e.target.value })}
          />
        </div>
      ) : (
        <div className="text-sm">
          {loading ? (
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="size-3.5 animate-spin" /> Fetching rate…
            </span>
          ) : rateError ? (
            <span className="text-destructive">{rateError}</span>
          ) : state.auto ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">
                1 {foreignCurrency} = {state.auto.rate} {baseCurrency}
                <span className="ml-1 text-xs">
                  · {state.auto.provider} · {state.auto.date}
                </span>
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-7"
                onClick={() => fetchRate(foreignCurrency)}
                aria-label="Refresh rate"
              >
                <IconRefresh className="size-3.5" />
              </Button>
            </div>
          ) : (
            <span className="text-muted-foreground">
              Choose a currency to fetch today&rsquo;s rate.
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between border-t pt-2 text-sm">
        <span className="text-muted-foreground">Converts to</span>
        <span className="font-semibold">
          {result.rate != null && Number(state.foreignAmount) > 0
            ? formatMoney(result.baseAmountCents, baseCurrency)
            : "—"}
        </span>
      </div>
    </div>
  )
}
