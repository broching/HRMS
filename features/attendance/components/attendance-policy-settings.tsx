"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { getErrorMessage } from "@/lib/errors"

/**
 * Org-wide attendance policy: whether staff must clock attendance by default
 * (individuals can be overridden on their profile) and the default overtime
 * multiplier used when scheduling OT.
 */
export function AttendancePolicySettings() {
  const settings = useQuery(api.attendanceSettings.get)
  const save = useMutation(api.attendanceSettings.save)

  const [multiplier, setMultiplier] = React.useState("")
  React.useEffect(() => {
    if (settings) setMultiplier(String(settings.defaultOvertimeMultiplier))
  }, [settings])

  if (settings === undefined) {
    return (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  async function toggleRequired(requiredByDefault: boolean) {
    try {
      await save({
        requiredByDefault,
        defaultOvertimeMultiplier: settings!.defaultOvertimeMultiplier,
      })
      toast.success(
        requiredByDefault
          ? "Attendance is now required by default"
          : "Attendance is now optional by default",
      )
    } catch (e) {
      toast.error(
        getErrorMessage(e, "We couldn't save the change. Please try again."),
      )
    }
  }

  async function saveMultiplier() {
    const m = parseFloat(multiplier)
    if (Number.isNaN(m) || m <= 0) {
      toast.error("Enter an overtime multiplier greater than 0 (e.g. 1.5).")
      return
    }
    try {
      await save({
        requiredByDefault: settings!.requiredByDefault,
        defaultOvertimeMultiplier: m,
      })
      toast.success("Saved")
    } catch (e) {
      toast.error(
        getErrorMessage(e, "We couldn't save the change. Please try again."),
      )
    }
  }

  return (
    <div className="px-4 lg:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Attendance policy</CardTitle>
          <CardDescription>
            Defaults for the whole organisation. Override any individual on their
            profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="required-default" className="text-sm font-medium">
                Require attendance by default
              </Label>
              <p className="text-muted-foreground text-sm">
                New employees must clock in/out unless overridden. When off, only
                employees explicitly marked as required will see the clock-in card.
              </p>
            </div>
            <Switch
              id="required-default"
              checked={settings.requiredByDefault}
              onCheckedChange={toggleRequired}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ot-multiplier">Default overtime multiplier</Label>
            <div className="flex items-center gap-2">
              <Input
                id="ot-multiplier"
                type="number"
                step="0.1"
                min="0"
                className="w-28"
                value={multiplier}
                onChange={(e) => setMultiplier(e.target.value)}
              />
              <Button size="sm" onClick={saveMultiplier}>
                Save
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Used to seed the rate when scheduling overtime (e.g. 1.5× hourly pay).
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
