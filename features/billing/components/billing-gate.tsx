"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { IconLock, IconAlertTriangle } from "@tabler/icons-react"
import { PricingPlans } from "./pricing-plans"

/**
 * App-wide subscription gate. Wraps the authenticated app content: while the
 * org's subscription is active (or enforcement is off) it renders children
 * unchanged; otherwise it replaces the page with a paywall. Admins see the
 * pricing plans; everyone else sees a "contact your admin" notice. The top nav
 * stays mounted above this, so the org switcher and account menu remain usable.
 */
export function BillingGate({ children }: { children: React.ReactNode }) {
  const access = useQuery(api.billing.getAccess)

  // First-load flash only (the query is cached thereafter).
  if (access === undefined) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="border-primary/30 border-t-primary size-8 animate-spin rounded-full border-2" />
      </div>
    )
  }

  if (access.allowed) return <>{children}</>

  const pastDue = access.state === "past_due"

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 lg:px-6">
      <div className="mx-auto mb-8 max-w-2xl text-center">
        <div className="bg-primary/10 text-primary mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl">
          <IconLock className="size-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">
          {access.manageable
            ? "Activate LeadMighty HR"
            : "Subscription inactive"}
        </h1>
        <p className="text-muted-foreground mt-2 text-base">
          {access.manageable
            ? `Choose a plan to unlock ${access.orgName ?? "your workspace"}. Every plan includes the full HR suite — pick the headcount that matches your team.`
            : `Your organization's subscription isn't active. Ask an admin to choose a plan to restore access.`}
        </p>
      </div>

      {pastDue && access.manageable && (
        <div className="border-destructive/30 bg-destructive/5 text-destructive mx-auto mb-6 flex max-w-2xl items-start gap-3 rounded-xl border p-4 text-sm">
          <IconAlertTriangle className="mt-0.5 size-5 shrink-0" />
          <p>
            Your last payment didn&apos;t go through. Update your card in the
            billing portal to avoid losing access.
          </p>
        </div>
      )}

      {access.manageable ? (
        <PricingPlans canManage currentPlan={access.plan} />
      ) : (
        <div className="text-muted-foreground mx-auto max-w-md rounded-2xl border border-border bg-card p-6 text-center text-sm">
          Only an admin can manage billing for this organization.
        </div>
      )}
    </div>
  )
}
