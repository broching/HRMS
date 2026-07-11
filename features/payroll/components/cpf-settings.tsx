"use client"

import * as React from "react"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { IconTrash, IconPlus, IconAlertTriangle } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { dollarsToCents, centsToInput } from "@/features/payroll/lib/labels"
import { getErrorMessage } from "@/lib/errors"

// Sentinel used for the "and above" top band (Convex numbers must be finite).
const TOP_AGE = 200

type BandRow = { maxAge: string; ee: string; er: string; top: boolean }
type GradRow = { ee: string; er: string }

// fraction (0.17) → percent string ("17")
const pct = (n: number) => String(+(n * 100).toFixed(4))
const toFraction = (s: string) => Number(s) / 100

export function CpfSettings() {
  const data = useQuery(api.payrollSettings.get)
  const save = useMutation(api.payrollSettings.saveCpf)
  const seed = useMutation(api.payrollSettings.seedCpfDefaults)

  const [ceiling, setCeiling] = React.useState("")
  const [bands, setBands] = React.useState<BandRow[] | null>(null)
  const [yr1, setYr1] = React.useState<GradRow>({ ee: "", er: "" })
  const [yr2, setYr2] = React.useState<GradRow>({ ee: "", er: "" })
  const [busy, setBusy] = React.useState(false)
  const seeded = React.useRef(false)

  React.useEffect(() => {
    if (!data || seeded.current) return
    seeded.current = true
    seedFromData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  function seedFromData() {
    if (!data) return
    setCeiling(centsToInput(data.cpf.owCeilingCents))
    setBands(
      data.cpf.bands.map((b, i, arr) => ({
        maxAge: b.maxAge >= TOP_AGE ? "" : String(b.maxAge),
        ee: pct(b.employeeRate),
        er: pct(b.employerRate),
        top: i === arr.length - 1,
      })),
    )
    setYr1({ ee: pct(data.cpf.prYear1.employeeRate), er: pct(data.cpf.prYear1.employerRate) })
    setYr2({ ee: pct(data.cpf.prYear2.employeeRate), er: pct(data.cpf.prYear2.employerRate) })
  }

  if (data === undefined || bands === null) {
    return (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  function patchBand(i: number, p: Partial<BandRow>) {
    setBands((b) => (b ? b.map((x, j) => (j === i ? { ...x, ...p } : x)) : b))
  }

  async function onSave() {
    if (!bands) return
    const owCeilingCents = dollarsToCents(ceiling)
    if (owCeilingCents === null || owCeilingCents <= 0) {
      toast.error("Enter a valid OW ceiling.")
      return
    }
    const parsedBands = bands.map((b, i, arr) => ({
      maxAge: i === arr.length - 1 ? TOP_AGE : Math.round(Number(b.maxAge)),
      employeeRate: toFraction(b.ee),
      employerRate: toFraction(b.er),
    }))
    for (const b of parsedBands) {
      if (
        !Number.isFinite(b.maxAge) ||
        !Number.isFinite(b.employeeRate) ||
        !Number.isFinite(b.employerRate)
      ) {
        toast.error("Every band needs a valid age and rates.")
        return
      }
    }
    setBusy(true)
    try {
      await save({
        cpf: {
          owCeilingCents,
          bands: parsedBands,
          prYear1: { employeeRate: toFraction(yr1.ee), employerRate: toFraction(yr1.er) },
          prYear2: { employeeRate: toFraction(yr2.ee), employerRate: toFraction(yr2.er) },
        },
      })
      toast.success("CPF settings saved")
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
          Representative CPF rates. Rates change by Budget year and are being
          progressively raised for workers aged 55–65 — verify every figure
          against the current CPF Board tables before running live payroll.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ordinary Wage ceiling</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex max-w-xs flex-col gap-1.5">
            <Label>Monthly OW ceiling</Label>
            <Input
              inputMode="decimal"
              value={ceiling}
              onChange={(e) => setCeiling(e.target.value)}
              placeholder="8000.00"
            />
            <p className="text-muted-foreground text-xs">
              CPF is charged on Ordinary Wages up to this monthly cap.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Citizen / PR (3rd year+) rates by age
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="text-muted-foreground grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs font-medium">
            <span>Aged up to</span>
            <span>Employee %</span>
            <span>Employer %</span>
            <span />
          </div>
          {bands.map((b, i) => (
            <div
              key={i}
              className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2"
            >
              {b.top ? (
                <span className="text-muted-foreground text-sm">and above</span>
              ) : (
                <Input
                  inputMode="numeric"
                  value={b.maxAge}
                  onChange={(e) => patchBand(i, { maxAge: e.target.value })}
                  placeholder="55"
                />
              )}
              <Input
                inputMode="decimal"
                value={b.ee}
                onChange={(e) => patchBand(i, { ee: e.target.value })}
                placeholder="20"
              />
              <Input
                inputMode="decimal"
                value={b.er}
                onChange={(e) => patchBand(i, { er: e.target.value })}
                placeholder="17"
              />
              {!b.top ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive size-8"
                  onClick={() =>
                    setBands((bs) => (bs ? bs.filter((_, k) => k !== i) : bs))
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
              setBands((bs) =>
                bs
                  ? [
                      ...bs.slice(0, -1),
                      { maxAge: "", ee: "", er: "", top: false },
                      ...bs.slice(-1),
                    ]
                  : bs,
              )
            }
          >
            <IconPlus className="mr-1 inline size-3.5" />
            Add age band
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Permanent Resident — graduated rates
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground text-xs">
            Applied during a PR&rsquo;s first two years (derived from their PR
            start date). From the 3rd year they use the age-banded rates above.
          </p>
          {(
            [
              ["Year 1", yr1, setYr1],
              ["Year 2", yr2, setYr2],
            ] as const
          ).map(([label, val, set]) => (
            <div key={label} className="grid grid-cols-[80px_1fr_1fr] items-center gap-2">
              <span className="text-sm font-medium">{label}</span>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Employee %</Label>
                <Input
                  inputMode="decimal"
                  value={val.ee}
                  onChange={(e) => set({ ...val, ee: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Employer %</Label>
                <Input
                  inputMode="decimal"
                  value={val.er}
                  onChange={(e) => set({ ...val, er: e.target.value })}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={onSave} disabled={busy}>
          {busy ? "Saving…" : "Save CPF settings"}
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await seed({})
              seeded.current = false // re-seed local form from refetched data
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
