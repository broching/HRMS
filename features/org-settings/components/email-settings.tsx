"use client"

import { useEffect, useRef, useState } from "react"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import { IconMail, IconUpload } from "@tabler/icons-react"
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
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Keep in sync with EMAIL_MODULES in convex/emailSettings.ts.
export type EmailModuleKey = "claims" | "paymentRequests" | "payroll" | "leave"

type ModuleConfig = {
  enabled: boolean
  accentColor: string
  fontFamily: string
  fromName: string
  footerText: string
}

const DEFAULT_ACCENT = "#2563eb"

const MODULE_META: Record<
  EmailModuleKey,
  { label: string; hint: string; sample: { title: string; body: string; cta: string } }
> = {
  claims: {
    label: "Expense claims",
    hint: "Submissions, approvals and reimbursements.",
    sample: {
      title: "Claim approved",
      body: "Your expense claim of $128.40 has been approved.",
      cta: "View claim",
    },
  },
  paymentRequests: {
    label: "Payment requests",
    hint: "Requests, approvals and payments.",
    sample: {
      title: "Payment request to review",
      body: "A payment request of $2,400.00 is awaiting your approval.",
      cta: "Review & approve",
    },
  },
  payroll: {
    label: "Payroll",
    hint: "Payslip releases and approval nudges.",
    sample: {
      title: "Your payslip is ready",
      body: "Your payslip for June 2026 has been released.",
      cta: "View payslip",
    },
  },
  leave: {
    label: "Leave",
    hint: "Leave requests and approvals.",
    sample: {
      title: "Leave request to review",
      body: "A leave request for 3 days is awaiting your approval.",
      cta: "Review request",
    },
  },
}

const FONT_OPTIONS: { value: string; label: string; css: string }[] = [
  {
    value: "system",
    label: "System (sans-serif)",
    css: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  },
  {
    value: "serif",
    label: "Serif (Georgia)",
    css: "Georgia,'Times New Roman',Times,serif",
  },
  {
    value: "mono",
    label: "Monospace",
    css: "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace",
  },
  {
    value: "rounded",
    label: "Rounded (Trebuchet)",
    css: "'Trebuchet MS','Segoe UI',Verdana,Geneva,sans-serif",
  },
]

function fontCss(value: string): string {
  return FONT_OPTIONS.find((f) => f.value === value)?.css ?? FONT_OPTIONS[0].css
}

// The get query returns resolved (nullable) values; convert one module's config
// to the mutation input shape (blank/null → undefined).
function outToInput(m: {
  enabled: boolean
  accentColor: string | null
  fontFamily: string | null
  fromName: string | null
  footerText: string | null
}) {
  return {
    enabled: m.enabled,
    accentColor: m.accentColor ?? undefined,
    fontFamily: m.fontFamily ?? undefined,
    fromName: m.fromName ?? undefined,
    footerText: m.footerText ?? undefined,
  }
}

/**
 * Email notification settings scoped to a single module. Embedded in each
 * module's own settings (Claims → Email, Payroll → Email, …). Saving preserves
 * the other modules' config untouched.
 */
export function ModuleEmailSettings({ module }: { module: EmailModuleKey }) {
  const me = useCurrentMember()
  const settings = useQuery(api.emailSettings.get)
  const save = useMutation(api.emailSettings.save)
  const generateLogoUploadUrl = useMutation(
    api.emailSettings.generateLogoUploadUrl,
  )
  const setLogo = useMutation(api.emailSettings.setLogo)
  const removeLogo = useMutation(api.emailSettings.removeLogo)

  const [config, setConfig] = useState<ModuleConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const meta = MODULE_META[module]

  useEffect(() => {
    if (!settings) return
    const m = settings.modules[module]
    setConfig({
      enabled: m.enabled,
      accentColor: m.accentColor ?? DEFAULT_ACCENT,
      fontFamily: m.fontFamily ?? "system",
      fromName: m.fromName ?? "",
      footerText: m.footerText ?? "",
    })
  }, [settings, module])

  const canManage = me?.role === "admin"

  function update(patch: Partial<ModuleConfig>) {
    setConfig((c) => (c ? { ...c, ...patch } : c))
  }

  async function handleSave() {
    if (!config || !settings) return
    setSaving(true)
    try {
      // Preserve the other three modules exactly; only replace this one.
      const modules = {
        claims: outToInput(settings.modules.claims),
        paymentRequests: outToInput(settings.modules.paymentRequests),
        payroll: outToInput(settings.modules.payroll),
        leave: outToInput(settings.modules.leave),
      }
      modules[module] = {
        enabled: config.enabled,
        accentColor: config.accentColor.trim() || undefined,
        fontFamily: config.fontFamily,
        fromName: config.fromName.trim() || undefined,
        footerText: config.footerText.trim() || undefined,
      }
      await save({ modules })
      toast.success("Email settings saved")
    } catch {
      toast.error("Could not save email settings")
    } finally {
      setSaving(false)
    }
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
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
      toast.success("Email logo updated")
    } catch {
      toast.error("Could not upload logo")
    } finally {
      setUploadingLogo(false)
    }
  }

  if (me !== undefined && !canManage) {
    return (
      <div className="px-4 lg:px-6">
        <div className="text-muted-foreground rounded-lg border py-12 text-center text-sm">
          Only administrators can change email notification settings.
        </div>
      </div>
    )
  }

  return (
    <div className="grid max-w-2xl gap-6 px-4 lg:px-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconMail className="size-5" />
            {meta.label} emails
          </CardTitle>
          <CardDescription>
            When on, {meta.hint.toLowerCase()} in-app notifications are also
            emailed with a button that opens the relevant page. Off = in-app
            only.
          </CardDescription>
        </CardHeader>
        {!config ? (
          <CardContent>
            <Skeleton className="h-40 w-full" />
          </CardContent>
        ) : (
          <>
            <CardContent className="grid gap-5">
              <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Send emails</span>
                  <span className="text-muted-foreground text-xs">
                    Email {meta.label.toLowerCase()} notifications to recipients.
                  </span>
                </div>
                <Switch
                  checked={config.enabled}
                  onCheckedChange={(v) => update({ enabled: v })}
                />
              </div>

              {config.enabled && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>Accent color</Label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={config.accentColor}
                          onChange={(e) =>
                            update({ accentColor: e.target.value })
                          }
                          className="h-9 w-12 cursor-pointer rounded border bg-transparent p-1"
                        />
                        <Input
                          value={config.accentColor}
                          onChange={(e) =>
                            update({ accentColor: e.target.value })
                          }
                          className="font-mono"
                        />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label>Font</Label>
                      <Select
                        value={config.fontFamily}
                        onValueChange={(v) => update({ fontFamily: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FONT_OPTIONS.map((f) => (
                            <SelectItem key={f.value} value={f.value}>
                              {f.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>From name</Label>
                      <Input
                        value={config.fromName}
                        onChange={(e) => update({ fromName: e.target.value })}
                        placeholder="Acme HR"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Footer text</Label>
                      <Textarea
                        value={config.footerText}
                        onChange={(e) => update({ footerText: e.target.value })}
                        placeholder="Acme Pte Ltd · 123 Orchard Rd, Singapore"
                        rows={1}
                      />
                    </div>
                  </div>

                  {/* Shared logo */}
                  <div className="flex items-center gap-4 border-t pt-4">
                    <div className="bg-muted flex h-12 w-24 items-center justify-center overflow-hidden rounded-md border">
                      {settings?.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={settings.logoUrl}
                          alt="Email logo"
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          No logo
                        </span>
                      )}
                    </div>
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
                        {settings?.logoUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={uploadingLogo}
                            onClick={async () => {
                              try {
                                await removeLogo()
                                toast.success("Email logo removed")
                              } catch {
                                toast.error("Could not remove logo")
                              }
                            }}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                      <p className="text-muted-foreground text-xs">
                        Shared across all email. Falls back to your org name.
                      </p>
                    </div>
                  </div>

                  <EmailPreview
                    sample={meta.sample}
                    config={config}
                    logoUrl={settings?.logoUrl ?? null}
                  />
                </>
              )}
            </CardContent>
            <CardFooter>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save email settings"}
              </Button>
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  )
}

// A lightweight in-browser approximation of the sent email so admins can see
// the accent + font before saving. Not the exact renderer, just a preview.
function EmailPreview({
  sample,
  config,
  logoUrl,
}: {
  sample: { title: string; body: string; cta: string }
  config: ModuleConfig
  logoUrl: string | null
}) {
  const accent = /^#[0-9a-fA-F]{3,8}$/.test(config.accentColor)
    ? config.accentColor
    : DEFAULT_ACCENT
  const font = fontCss(config.fontFamily)
  return (
    <div className="grid gap-1.5">
      <Label className="text-muted-foreground text-xs">Preview</Label>
      <div
        className="overflow-hidden rounded-lg border"
        style={{ fontFamily: font }}
      >
        <div
          className="flex items-center px-4 py-3"
          style={{ backgroundColor: accent }}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="logo"
              className="max-h-7 max-w-[140px] object-contain"
            />
          ) : (
            <span className="text-sm font-bold text-white">
              {config.fromName.trim() || "Your organization"}
            </span>
          )}
        </div>
        <div className="bg-white px-4 py-4">
          <div className="text-[15px] font-semibold text-neutral-900">
            {sample.title}
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-neutral-600">
            {sample.body}
          </p>
          <span
            className="mt-3 inline-block rounded-md px-4 py-2 text-[13px] font-semibold text-white"
            style={{ backgroundColor: accent }}
          >
            {sample.cta}
          </span>
          {config.footerText.trim() && (
            <p className="mt-4 border-t border-neutral-100 pt-3 text-[11px] text-neutral-400">
              {config.footerText.trim()}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
