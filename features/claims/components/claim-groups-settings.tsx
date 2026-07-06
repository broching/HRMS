"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getErrorMessage } from "@/lib/errors"

// A "claim group" is one monthly submission batch (each submit/resubmit creates
// one). This tab configures how those batches behave — for now, the per-month
// cap enforced in `claims.submitMonth`.
export function ClaimGroupsSettings() {
  const data = useQuery(api.claimSettings.get)
  const save = useMutation(api.claimSettings.setMaxGroupsPerPeriod)
  const [value, setValue] = React.useState<number | null>(null)
  const [busy, setBusy] = React.useState(false)

  // Seed once the settings load.
  React.useEffect(() => {
    if (data) setValue(data.maxGroupsPerPeriod)
  }, [data])

  if (data === undefined) {
    return (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  async function onSave() {
    setBusy(true)
    try {
      await save({ maxGroupsPerPeriod: value })
      toast.success("Claim group settings saved")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save settings"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="px-4 lg:px-6">
      <div className="divide-y rounded-lg border px-5">
        <div className="grid gap-4 py-6 md:grid-cols-[280px_1fr]">
          <div>
            <h3 className="font-semibold">Submissions per period</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              Cap how many claim submissions — including resubmissions of
              rejected claims — an employee can make in a single month. Each
              submitted batch counts as one.
            </p>
          </div>
          <div className="max-w-2xl">
            <div className="flex flex-col gap-1.5">
              <Label>Max submissions per month</Label>
              <Select
                value={value === null ? "none" : String(value)}
                onValueChange={(v) =>
                  setValue(v === "none" ? null : Number(v))
                }
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No limit</SelectItem>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} submission{n === 1 ? "" : "s"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex justify-start">
        <Button onClick={onSave} disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
  )
}
