"use client"

import * as React from "react"
import { useOrganizationList, useUser, useClerk } from "@clerk/nextjs"
import { useMutation, useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { ConvexError } from "convex/values"
import { toast } from "sonner"
import {
  IconArrowRight,
  IconArrowLeft,
  IconCheck,
  IconBuilding,
  IconMapPin,
  IconPhoto,
  IconSparkles,
  IconLoader2,
  IconUpload,
  IconX,
} from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PricingPlans } from "@/features/billing/components/pricing-plans"

// ─── Reference data ──────────────────────────────────────────────────────────

const INDUSTRIES = [
  "Technology & Software",
  "Financial Services",
  "Retail & E-commerce",
  "Food & Beverage",
  "Healthcare",
  "Manufacturing",
  "Construction & Real Estate",
  "Professional Services",
  "Education",
  "Logistics & Transport",
  "Hospitality & Travel",
  "Non-profit",
  "Other",
] as const

const SIZES: { label: string; seats: number }[] = [
  { label: "1–10", seats: 8 },
  { label: "11–25", seats: 25 },
  { label: "26–50", seats: 50 },
  { label: "51–100", seats: 100 },
  { label: "101–150", seats: 150 },
]

const COUNTRIES: { code: string; name: string; tz: string; currency: string }[] =
  [
    { code: "SG", name: "Singapore", tz: "Asia/Singapore", currency: "SGD" },
    { code: "MY", name: "Malaysia", tz: "Asia/Kuala_Lumpur", currency: "MYR" },
    { code: "ID", name: "Indonesia", tz: "Asia/Jakarta", currency: "IDR" },
    { code: "TH", name: "Thailand", tz: "Asia/Bangkok", currency: "THB" },
    { code: "PH", name: "Philippines", tz: "Asia/Manila", currency: "PHP" },
    { code: "VN", name: "Vietnam", tz: "Asia/Ho_Chi_Minh", currency: "VND" },
    { code: "HK", name: "Hong Kong", tz: "Asia/Hong_Kong", currency: "HKD" },
    { code: "IN", name: "India", tz: "Asia/Kolkata", currency: "INR" },
    { code: "AU", name: "Australia", tz: "Australia/Sydney", currency: "AUD" },
    { code: "GB", name: "United Kingdom", tz: "Europe/London", currency: "GBP" },
    { code: "US", name: "United States", tz: "America/New_York", currency: "USD" },
    { code: "AE", name: "UAE", tz: "Asia/Dubai", currency: "AED" },
  ]

const TIMEZONES = [
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Asia/Jakarta",
  "Asia/Bangkok",
  "Asia/Manila",
  "Asia/Ho_Chi_Minh",
  "Asia/Hong_Kong",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Australia/Sydney",
  "Europe/London",
  "America/New_York",
  "America/Los_Angeles",
]

const STEPS = [
  { key: "company", label: "Company", icon: IconBuilding },
  { key: "location", label: "Location", icon: IconMapPin },
  { key: "brand", label: "Brand", icon: IconPhoto },
  { key: "plan", label: "Plan", icon: IconSparkles },
] as const

const PLAN_STEP = 3 // zero-based index of the plan step

type Form = {
  name: string
  industry: string
  size: string
  country: string
  timezone: string
  officeName: string
  officeAddress: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ─── Flow ────────────────────────────────────────────────────────────────────

export function OnboardingFlow() {
  const { user } = useUser()
  const { signOut } = useClerk()
  const { isLoaded, createOrganization, setActive } = useOrganizationList()

  const org = useQuery(api.organizations.current)
  const provision = useMutation(api.organizations.provisionCurrent)
  const ensureSelf = useMutation(api.members.ensureSelf)
  const complete = useMutation(api.organizations.completeOnboarding)

  // "?new=1" (from the in-app "Create new company" action) forces a brand-new
  // org even when one is already active — otherwise a live org means "resume".
  const [isNew] = React.useState(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("new") === "1",
  )
  const [step, setStep] = React.useState(0)
  const [busy, setBusy] = React.useState(false)
  const [form, setForm] = React.useState<Form>({
    name: "",
    industry: "",
    size: "",
    country: "SG",
    timezone: "Asia/Singapore",
    officeName: "",
    officeAddress: "",
  })

  // Resume: if an org is already active when the funnel opens (e.g. created but
  // not yet paid), jump to the plan step. Runs once, so it never fights the
  // manual advance right after we create the org mid-flow.
  const resumed = React.useRef(false)
  React.useEffect(() => {
    if (resumed.current || org === undefined) return
    resumed.current = true
    if (org && !isNew) {
      setForm((f) => ({
        ...f,
        name: org.name,
        country: org.country,
        timezone: org.settings.timezone,
        industry: org.settings.industry ?? "",
        size: org.settings.companySize ?? "",
      }))
      setStep(PLAN_STEP)
    }
  }, [org])

  const createdRef = React.useRef(false)
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }))

  const seatsGuess =
    SIZES.find((s) => s.label === form.size)?.seats ?? 10

  async function createOrgAndSaveBasics() {
    // Create a new org unless we're resuming one that already exists. The
    // in-app "Create new company" path (isNew) always creates a fresh org even
    // though the user already has an active one. `createdRef` guards against a
    // second org on Back → Continue (where `org` may not have updated yet).
    if (!createdRef.current && (isNew || !org)) {
      if (!isLoaded || !createOrganization || !setActive) {
        throw new Error("Not ready yet — please try again.")
      }
      const created = await createOrganization({ name: form.name.trim() })
      await setActive({ organization: created.id })
      // The Convex auth token needs a beat to carry the new active org; poll
      // provisionCurrent (idempotent) until it resolves against the new org.
      let orgId = null
      for (let i = 0; i < 25 && !orgId; i++) {
        orgId = await provision({
          name: form.name.trim(),
          expectClerkOrgId: created.id,
        })
        if (!orgId) await sleep(400)
      }
      if (!orgId) throw new Error("Timed out setting up your workspace.")
      await ensureSelf({})
      createdRef.current = true
    }
    await saveDetails()
  }

  async function saveDetails() {
    const country = COUNTRIES.find((c) => c.code === form.country)
    await complete({
      industry: form.industry || undefined,
      companySize: form.size || undefined,
      country: form.country,
      timezone: form.timezone,
      currency: country?.currency,
      officeName: form.officeName || undefined,
      officeAddress: form.officeAddress || undefined,
    })
  }

  async function next() {
    if (busy) return
    setBusy(true)
    try {
      if (step === 0) {
        await createOrgAndSaveBasics()
        setStep(1)
      } else if (step === 1) {
        await saveDetails()
        setStep(2)
      } else if (step === 2) {
        setStep(3)
      }
    } catch (err) {
      toast.error(errMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const canContinue = React.useMemo(() => {
    if (step === 0) return form.name.trim().length >= 2 && !!form.industry && !!form.size
    if (step === 1) return !!form.country && !!form.timezone
    return true
  }, [step, form])

  return (
    <div className="onboarding-light bg-background text-foreground min-h-svh">
      <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col lg:flex-row">
        {/* Brand / progress rail */}
        <Rail
          step={step}
          email={user?.primaryEmailAddress?.emailAddress ?? undefined}
          onSignOut={() => signOut({ redirectUrl: "/" })}
        />

        {/* Step content */}
        <main className="flex flex-1 flex-col px-5 py-8 sm:px-10 lg:py-14">
          <div
            key={step}
            className="mx-auto flex w-full flex-1 flex-col motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300"
            style={{ maxWidth: step === PLAN_STEP ? "56rem" : "34rem" }}
          >
            <StepHeader step={step} />

            <div className="mt-8 flex-1">
              {step === 0 && <CompanyStep form={form} set={set} />}
              {step === 1 && <LocationStep form={form} set={set} />}
              {step === 2 && <BrandStep orgLogo={org?.imageUrl ?? null} name={form.name} />}
              {step === PLAN_STEP && (
                <div className="flex flex-col gap-5">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="text-muted-foreground hover:text-foreground -mb-1 flex w-fit items-center gap-1 text-sm"
                  >
                    <IconArrowLeft className="size-4" /> Back to setup
                  </button>
                  <PricingPlans
                    canManage
                    ctaLabel="Get started"
                    initialSeats={seatsGuess}
                  />
                </div>
              )}
            </div>

            {step !== PLAN_STEP && (
              <div className="mt-10 flex items-center justify-between gap-4">
                {step > 0 ? (
                  <Button
                    variant="ghost"
                    onClick={() => setStep((s) => s - 1)}
                    disabled={busy}
                  >
                    <IconArrowLeft className="size-4" /> Back
                  </Button>
                ) : (
                  <span />
                )}
                <Button size="lg" onClick={next} disabled={!canContinue || busy}>
                  {busy ? (
                    <>
                      <IconLoader2 className="size-4 animate-spin" />
                      {step === 0 ? "Creating workspace…" : "Saving…"}
                    </>
                  ) : (
                    <>
                      Continue <IconArrowRight className="size-4" />
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

// ─── Rail (brand + spectrum progress spine) ──────────────────────────────────

function Rail({
  step,
  email,
  onSignOut,
}: {
  step: number
  email?: string
  onSignOut: () => void
}) {
  const pct = (step / (STEPS.length - 1)) * 100
  return (
    <aside className="border-border/70 bg-gradient-to-b from-[oklch(0.98_0.02_255)] to-background flex flex-col gap-8 border-b px-6 py-8 sm:px-10 lg:w-[21rem] lg:border-b-0 lg:border-r lg:py-14">
      <div className="flex items-center gap-2.5">
        <span
          className="size-8 rounded-lg shadow-sm"
          style={{
            background:
              "conic-gradient(from 210deg, #6366f1, #38bdf8, #a855f7, #6366f1)",
          }}
          aria-hidden
        />
        <span className="text-lg font-bold tracking-tight">LeadMighty HR</span>
      </div>

      <div className="hidden lg:block">
        <div className="text-muted-foreground text-[11px] font-semibold tracking-[0.16em] uppercase">
          Set up your workspace
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          A few quick details and you&apos;ll be running payroll, leave and more
          — all in one place.
        </p>
      </div>

      {/* Spectrum spine — desktop */}
      <ol className="relative ml-1 hidden flex-1 flex-col gap-7 lg:flex">
        <span
          className="bg-border/70 absolute top-2 bottom-2 left-[13px] w-0.5 rounded-full"
          aria-hidden
        />
        <span
          className="absolute top-2 left-[13px] w-0.5 rounded-full transition-[height] duration-500"
          style={{
            height: `calc(${pct}% * 0.92)`,
            background: "linear-gradient(180deg, #6366f1, #38bdf8, #a855f7)",
          }}
          aria-hidden
        />
        {STEPS.map((s, i) => {
          const done = i < step
          const active = i === step
          const Icon = s.icon
          return (
            <li key={s.key} className="relative flex items-center gap-3.5">
              <span
                className={cn(
                  "z-10 flex size-7 shrink-0 items-center justify-center rounded-full border-2 bg-background transition-colors",
                  done && "border-transparent text-white",
                  active && "border-primary text-primary",
                  !done && !active && "border-border text-muted-foreground/60",
                )}
                style={
                  done
                    ? { background: "linear-gradient(135deg, #6366f1, #a855f7)" }
                    : undefined
                }
              >
                {done ? (
                  <IconCheck className="size-4" />
                ) : (
                  <Icon className="size-3.5" />
                )}
              </span>
              <div className="flex flex-col">
                <span
                  className={cn(
                    "text-sm font-medium transition-colors",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {s.label}
                </span>
                <span className="text-muted-foreground/60 text-[11px]">
                  Step {i + 1}
                </span>
              </div>
            </li>
          )
        })}
      </ol>

      {/* Compact progress — mobile */}
      <div className="lg:hidden">
        <div className="bg-border/70 h-1 w-full overflow-hidden rounded-full">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${((step + 1) / STEPS.length) * 100}%`,
              background: "linear-gradient(90deg, #6366f1, #38bdf8, #a855f7)",
            }}
          />
        </div>
        <div className="text-muted-foreground mt-2 text-xs">
          Step {step + 1} of {STEPS.length} · {STEPS[step].label}
        </div>
      </div>

      {email && (
        <div className="text-muted-foreground mt-auto hidden text-xs lg:block">
          <div className="truncate">Signed in as {email}</div>
          <button
            type="button"
            onClick={onSignOut}
            className="hover:text-foreground mt-1 underline underline-offset-2"
          >
            Sign out
          </button>
        </div>
      )}
    </aside>
  )
}

function StepHeader({ step }: { step: number }) {
  const copy = [
    {
      eyebrow: "Tell us about your company",
      title: "Let’s set up your workspace",
      sub: "This names your workspace and tailors defaults like leave and payroll.",
    },
    {
      eyebrow: "Where you operate",
      title: "Your location & first office",
      sub: "We use this for timezone, currency and statutory defaults. You can add more offices later.",
    },
    {
      eyebrow: "Make it yours",
      title: "Add your company logo",
      sub: "It appears across the app, payslips and documents. You can skip and add it later.",
    },
    {
      eyebrow: "Choose what you need",
      title: "Build your plan",
      sub: "Pick your team size and the modules you want. Core scales with your team; each module is a flat add-on.",
    },
  ][step]
  return (
    <div>
      <div className="text-primary text-[11px] font-semibold tracking-[0.16em] uppercase">
        {copy.eyebrow}
      </div>
      <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        {copy.title}
      </h1>
      <p className="text-muted-foreground mt-2 max-w-xl text-[15px]">
        {copy.sub}
      </p>
    </div>
  )
}

// ─── Steps ───────────────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  )
}

function CompanyStep({
  form,
  set,
}: {
  form: Form
  set: (p: Partial<Form>) => void
}) {
  return (
    <div className="flex flex-col gap-6">
      <Field label="Company name" hint="This is how your workspace is labelled.">
        <Input
          autoFocus
          value={form.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="e.g. Acme Pte Ltd"
          className="h-11 text-base"
        />
      </Field>

      <Field label="Industry">
        <div className="flex flex-wrap gap-2">
          {INDUSTRIES.map((ind) => (
            <Chip
              key={ind}
              active={form.industry === ind}
              onClick={() => set({ industry: ind })}
            >
              {ind}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="How many employees?">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {SIZES.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => set({ size: s.label })}
              className={cn(
                "rounded-xl border px-3 py-3 text-sm font-semibold tabular-nums transition-colors",
                form.size === s.label
                  ? "border-primary/50 bg-primary/5 text-primary"
                  : "border-border hover:bg-accent/50",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </Field>
    </div>
  )
}

function LocationStep({
  form,
  set,
}: {
  form: Form
  set: (p: Partial<Form>) => void
}) {
  function pickCountry(code: string) {
    const c = COUNTRIES.find((x) => x.code === code)
    set({ country: code })
    if (c) set({ timezone: c.tz })
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Country">
          <select
            value={form.country}
            onChange={(e) => pickCountry(e.target.value)}
            className="border-input bg-background h-11 rounded-md border px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Timezone">
          <select
            value={form.timezone}
            onChange={(e) => set({ timezone: e.target.value })}
            className="border-input bg-background h-11 rounded-md border px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="border-border/70 rounded-2xl border border-dashed p-5">
        <div className="text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase">
          Primary office
        </div>
        <div className="mt-3 flex flex-col gap-4">
          <Field label="Office name">
            <Input
              value={form.officeName}
              onChange={(e) => set({ officeName: e.target.value })}
              placeholder="e.g. Head Office"
              className="h-11"
            />
          </Field>
          <Field label="Address" hint="Used for attendance geofencing and documents.">
            <Input
              value={form.officeAddress}
              onChange={(e) => set({ officeAddress: e.target.value })}
              placeholder="Street address, city, postal code"
              className="h-11"
            />
          </Field>
        </div>
      </div>
    </div>
  )
}

function BrandStep({
  orgLogo,
  name,
}: {
  orgLogo: string | null
  name: string
}) {
  const genUrl = useMutation(api.organizations.generateLogoUploadUrl)
  const setLogo = useMutation(api.organizations.setLogo)
  const removeLogo = useMutation(api.organizations.removeLogo)
  const [uploading, setUploading] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  async function onFile(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.")
      return
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error("Image must be under 4 MB.")
      return
    }
    setUploading(true)
    try {
      const url = await genUrl({})
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      })
      const { storageId } = await res.json()
      await setLogo({ storageId })
      toast.success("Logo added.")
    } catch (err) {
      toast.error(errMessage(err))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
      <div className="border-border bg-muted/30 flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border">
        {orgLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={orgLogo} alt="Company logo" className="size-full object-cover" />
        ) : (
          <span className="text-muted-foreground text-3xl font-bold">
            {(name.trim()[0] ?? "?").toUpperCase()}
          </span>
        )}
      </div>

      <div className="flex-1">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : (
              <IconUpload className="size-4" />
            )}
            {orgLogo ? "Replace logo" : "Upload logo"}
          </Button>
          {orgLogo && (
            <Button
              variant="ghost"
              onClick={() => removeLogo({}).catch((e) => toast.error(errMessage(e)))}
              disabled={uploading}
            >
              <IconX className="size-4" /> Remove
            </Button>
          )}
        </div>
        <p className="text-muted-foreground mt-3 text-xs">
          PNG, JPG or SVG up to 4 MB. A square image works best. This step is
          optional — you can always add or change it later in settings.
        </p>
      </div>
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
        active
          ? "border-primary/50 bg-primary/5 text-primary"
          : "border-border text-muted-foreground hover:bg-accent/50",
      )}
    >
      {children}
    </button>
  )
}

function errMessage(err: unknown): string {
  if (err instanceof ConvexError) {
    const m = (err.data as { message?: string })?.message
    if (m) return m
  }
  if (err instanceof Error && err.message) return err.message
  return "Something went wrong. Please try again."
}
