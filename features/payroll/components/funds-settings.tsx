"use client"

import * as React from "react"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { IconPlus, IconTrash, IconAlertTriangle } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { dollarsToCents, centsToInput } from "@/features/payroll/lib/labels"
import { getErrorMessage } from "@/lib/errors"

const BAND_TOP = Number.MAX_SAFE_INTEGER

type BandRow = { max: string; amount: string; top: boolean }
type FundForm = {
  key: string
  name: string
  active: boolean
  bands: BandRow[]
}
type SdlForm = { ratePct: string; min: string; max: string; active: boolean }

export function FundsSettings() {
  const data = useQuery(api.payrollSettings.get)
  const save = useMutation(api.payrollSettings.save)
  const seed = useMutation(api.payrollSettings.seedFundDefaults)

  const [funds, setFunds] = React.useState<FundForm[] | null>(null)
  const [sdl, setSdl] = React.useState<SdlForm | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!data || funds !== null) return
    setFunds(
      data.shgFunds.map((f) => ({
        key: f.key,
        name: f.name,
        active: f.active,
        bands: f.bands.map((b, i, arr) => ({
          max: b.maxWageCents >= BAND_TOP ? "" : centsToInput(b.maxWageCents),
          amount: centsToInput(b.amountCents),
          top: i === arr.length - 1,
        })),
      })),
    )
    setSdl({
      ratePct: String(data.sdl.rate * 100),
      min: centsToInput(data.sdl.minCents),
      max: centsToInput(data.sdl.maxCents),
      active: data.sdl.active,
    })
  }, [data, funds])

  if (data === undefined || funds === null || sdl === null) {
    return <Skeleton className="h-96 w-full" />
  }

  function patchFund(i: number, p: Partial<FundForm>) {
    setFunds((f) => (f ? f.map((x, j) => (j === i ? { ...x, ...p } : x)) : f))
  }
  function patchBand(fi: number, bi: number, p: Partial<BandRow>) {
    setFunds((f) =>
      f
        ? f.map((fund, j) =>
            j === fi
              ? {
                  ...fund,
                  bands: fund.bands.map((b, k) =>
                    k === bi ? { ...b, ...p } : b,
                  ),
                }
              : fund,
          )
        : f,
    )
  }

  async function onSave() {
    if (!funds || !sdl || !data) return
    // Build fund tables. The last band is always "and above" (BAND_TOP).
    const shgFunds = funds.map((f) => ({
      key: f.key as "cdac" | "sinda" | "mbmf" | "ecf",
      name: f.name.trim() || f.key.toUpperCase(),
      active: f.active,
      bands: f.bands.map((b, i, arr) => ({
        maxWageCents:
          i === arr.length - 1 ? BAND_TOP : (dollarsToCents(b.max) ?? 0),
        amountCents: dollarsToCents(b.amount) ?? 0,
      })),
    }))
    const rate = Number(sdl.ratePct) / 100
    if (Number.isNaN(rate) || rate < 0) {
      toast.error("Enter a valid SDL rate.")
      return
    }
    setBusy(true)
    try {
      await save({
        shgFunds,
        sdl: {
          rate,
          minCents: dollarsToCents(sdl.min) ?? 0,
          maxCents: dollarsToCents(sdl.max) ?? 0,
          active: sdl.active,
        },
        approval: data.approval,
      })
      toast.success("Fund settings saved")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
        <IconAlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <p className="text-muted-foreground">
          These are representative default tables. Verify every figure against
          the current CDAC / SINDA / MBMF / ECF and SDL tables before running
          live payroll.
        </p>
      </div>

      {funds.map((fund, fi) => (
        <Card key={fund.key}>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">
              {fund.name}{" "}
              <span className="text-muted-foreground text-xs font-normal">
                (employee deduction)
              </span>
            </CardTitle>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={fund.active}
                onCheckedChange={(active) => patchFund(fi, { active })}
              />
              Active
            </label>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <div className="text-muted-foreground grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium">
              <span>Monthly wage up to</span>
              <span>Contribution</span>
              <span />
            </div>
            {fund.bands.map((b, bi) => (
              <div
                key={bi}
                className="grid grid-cols-[1fr_1fr_auto] items-center gap-2"
              >
                {b.top ? (
                  <span className="text-muted-foreground text-sm">
                    and above
                  </span>
                ) : (
                  <Input
                    inputMode="decimal"
                    value={b.max}
                    onChange={(e) => patchBand(fi, bi, { max: e.target.value })}
                    placeholder="2000.00"
                  />
                )}
                <Input
                  inputMode="decimal"
                  value={b.amount}
                  onChange={(e) => patchBand(fi, bi, { amount: e.target.value })}
                  placeholder="0.50"
                />
                {!b.top ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive size-8"
                    onClick={() =>
                      patchFund(fi, {
                        bands: fund.bands.filter((_, k) => k !== bi),
                      })
                    }
                  >
                    <IconTrash className="size-4" />
                  </Button>
                ) : (
                  <span className="w-8" />
                )}
              </div>
            ))}
            <button
              type="button"
              className="text-primary w-fit text-sm font-medium"
              onClick={() =>
                patchFund(fi, {
                  bands: [
                    ...fund.bands.slice(0, -1),
                    { max: "", amount: "", top: false },
                    ...fund.bands.slice(-1),
                  ],
                })
              }
            >
              + Add band
            </button>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">
            SDL{" "}
            <span className="text-muted-foreground text-xs font-normal">
              (Skills Development Levy · employer)
            </span>
          </CardTitle>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={sdl.active}
              onCheckedChange={(active) => setSdl({ ...sdl, active })}
            />
            Active
          </label>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label>Rate (% of gross)</Label>
            <Input
              inputMode="decimal"
              value={sdl.ratePct}
              onChange={(e) => setSdl({ ...sdl, ratePct: e.target.value })}
              placeholder="0.25"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Minimum</Label>
            <Input
              inputMode="decimal"
              value={sdl.min}
              onChange={(e) => setSdl({ ...sdl, min: e.target.value })}
              placeholder="2.00"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Maximum</Label>
            <Input
              inputMode="decimal"
              value={sdl.max}
              onChange={(e) => setSdl({ ...sdl, max: e.target.value })}
              placeholder="11.25"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={onSave} disabled={busy}>
          {busy ? "Saving…" : "Save fund settings"}
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await seed({})
              setFunds(null) // re-seed local form from refetched data
              toast.success("Reset to SG defaults")
            } catch (e) {
              toast.error(getErrorMessage(e, "Couldn't reset"))
            }
          }}
        >
          Reset to defaults
        </Button>
      </div>
    </div>
  )
}
