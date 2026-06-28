"use client"

import { useEffect, useState } from "react"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import { useCurrentMember } from "@/hooks/use-current-member"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

type FormState = {
  country: string
  currency: string
  timezone: string
  weekStart: string // "0" | "1"
  fiscalYearStartMonth: string // "1".."12"
}

export default function OrganizationSettingsPage() {
  const me = useCurrentMember()
  const org = useQuery(api.organizations.current)
  const updateSettings = useMutation(api.organizations.updateSettings)

  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (org) {
      setForm({
        country: org.country,
        currency: org.settings.currency,
        timezone: org.settings.timezone,
        weekStart: String(org.settings.weekStart),
        fiscalYearStartMonth: String(org.settings.fiscalYearStartMonth),
      })
    }
  }, [org])

  const canManage = me?.role === "admin"

  if (me !== undefined && !canManage) {
    return (
      <div className="px-4 lg:px-6">
        <p className="text-muted-foreground text-sm">
          You don&apos;t have permission to manage organization settings.
        </p>
      </div>
    )
  }

  async function handleSave() {
    if (!form) return
    setSaving(true)
    try {
      await updateSettings({
        country: form.country,
        settings: {
          currency: form.currency,
          timezone: form.timezone,
          weekStart: Number(form.weekStart),
          fiscalYearStartMonth: Number(form.fiscalYearStartMonth),
        },
      })
      toast.success("Organization settings saved")
    } catch {
      toast.error("Could not save settings")
    } finally {
      setSaving(false)
    }
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Organization</h1>
        <p className="text-muted-foreground text-sm">
          Locale and statutory defaults for {org?.name ?? "your organization"}.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Locale & statutory defaults</CardTitle>
          <CardDescription>
            Singapore is the default ruleset. Adjust per your jurisdiction.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!form ? (
            <div className="grid gap-4">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={form.country}
                  onChange={(e) => set("country", e.target.value.toUpperCase())}
                  maxLength={2}
                  placeholder="SG"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="currency">Currency</Label>
                <Input
                  id="currency"
                  value={form.currency}
                  onChange={(e) => set("currency", e.target.value.toUpperCase())}
                  maxLength={3}
                  placeholder="SGD"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Input
                  id="timezone"
                  value={form.timezone}
                  onChange={(e) => set("timezone", e.target.value)}
                  placeholder="Asia/Singapore"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="weekStart">Week starts on</Label>
                <Select
                  value={form.weekStart}
                  onValueChange={(v) => set("weekStart", v)}
                >
                  <SelectTrigger id="weekStart">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Monday</SelectItem>
                    <SelectItem value="0">Sunday</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="fiscalMonth">Fiscal year starts</Label>
                <Select
                  value={form.fiscalYearStartMonth}
                  onValueChange={(v) => set("fiscalYearStartMonth", v)}
                >
                  <SelectTrigger id="fiscalMonth">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }).map((_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>
                        {new Date(2000, i, 1).toLocaleString("en", {
                          month: "long",
                        })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <Button onClick={handleSave} disabled={!form || saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  )
}
