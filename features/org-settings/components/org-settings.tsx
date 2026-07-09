"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useQuery, useMutation, useAction } from "convex/react"
import { toast } from "sonner"
import { IconBuilding, IconUpload, IconUserCog } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { useCurrentMember } from "@/hooks/use-current-member"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"

type LocaleForm = {
  country: string
  currency: string
  timezone: string
  weekStart: string // "0" | "1"
  fiscalYearStartMonth: string // "1".."12"
}

export function OrgSettings() {
  const me = useCurrentMember()
  const org = useQuery(api.organizations.current)
  const updateSettings = useMutation(api.organizations.updateSettings)
  const rename = useAction(api.organizations.rename)
  const generateLogoUploadUrl = useMutation(
    api.organizations.generateLogoUploadUrl,
  )
  const setLogo = useMutation(api.organizations.setLogo)
  const removeLogo = useMutation(api.organizations.removeLogo)

  const [name, setName] = useState("")
  const [renaming, setRenaming] = useState(false)
  const [form, setForm] = useState<LocaleForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (org) {
      setName(org.name)
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
      <p className="text-muted-foreground px-1 text-sm">
        You don&apos;t have permission to manage organization settings.
      </p>
    )
  }

  async function handleRename() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === org?.name) return
    setRenaming(true)
    try {
      await rename({ name: trimmed })
      toast.success("Organization renamed")
    } catch {
      toast.error("Could not rename organization")
    } finally {
      setRenaming(false)
    }
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = "" // allow re-selecting the same file
    if (!file) return
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file")
      return
    }
    setUploadingLogo(true)
    try {
      const uploadUrl = await generateLogoUploadUrl()
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      })
      if (!res.ok) throw new Error("upload failed")
      const { storageId } = (await res.json()) as { storageId: string }
      await setLogo({ storageId: storageId as Id<"_storage"> })
      toast.success("Logo updated")
    } catch {
      toast.error("Could not upload logo")
    } finally {
      setUploadingLogo(false)
    }
  }

  async function handleRemoveLogo() {
    try {
      await removeLogo()
      toast.success("Logo removed")
    } catch {
      toast.error("Could not remove logo")
    }
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

  function set<K extends keyof LocaleForm>(key: K, value: LocaleForm[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f))
  }

  const initials = (org?.name ?? "")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

  return (
    <div className="grid max-w-3xl gap-6">
      {/* Organization profile */}
      <Card>
        <CardHeader>
          <CardTitle>Organization profile</CardTitle>
          <CardDescription>
            The name and logo shown across the workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!org ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <>
              <div className="flex items-center gap-4">
                <Avatar className="size-14 rounded-lg">
                  <AvatarImage src={org.imageUrl} alt={org.name} />
                  <AvatarFallback className="rounded-lg">
                    <IconBuilding className="size-6" />
                    <span className="sr-only">{initials}</span>
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoChange}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={uploadingLogo}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <IconUpload className="size-4" />
                      {uploadingLogo ? "Uploading…" : "Upload logo"}
                    </Button>
                    {org.imageUrl && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={uploadingLogo}
                        onClick={handleRemoveLogo}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    PNG, JPG or SVG. Square images work best.
                  </p>
                </div>
              </div>
              <div className="grid gap-2 sm:max-w-sm">
                <Label htmlFor="orgName">Organization name</Label>
                <Input
                  id="orgName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </>
          )}
        </CardContent>
        <CardFooter>
          <Button
            onClick={handleRename}
            disabled={
              !org || renaming || !name.trim() || name.trim() === org?.name
            }
          >
            {renaming ? "Saving…" : "Save name"}
          </Button>
        </CardFooter>
      </Card>

      {/* Locale & statutory defaults */}
      <Card>
        <CardHeader>
          <CardTitle>Locale &amp; statutory defaults</CardTitle>
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
        <CardFooter>
          <Button onClick={handleSave} disabled={!form || saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </CardFooter>
      </Card>

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Invite people and manage their access to the workspace.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" asChild>
            <Link href="/hr-lounge">
              <IconUserCog className="size-4" />
              Manage members
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
