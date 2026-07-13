import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { TopNav } from "@/components/layout/top-nav"
import { SectionChrome } from "@/components/layout/section-chrome"
import { LoadingBar } from "@/components/layout/loading-bar"
import { EnsureMembership } from "@/components/layout/ensure-membership"
import { BillingGate } from "@/features/billing/components/billing-gate"

// OrgGuard: every authenticated HRMS route requires an active organization.
// Unauthenticated users are bounced to the landing page (modal sign-in);
// signed-in users with no active org are sent to the org picker.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { userId, orgId } = await auth()
  if (!userId) redirect("/")
  if (!orgId) redirect("/select-org")

  return (
    <div className="bg-muted/20 group/layout flex min-h-svh flex-col">
      <EnsureMembership />
      <LoadingBar />
      <TopNav />
      <BillingGate>
        <SectionChrome>{children}</SectionChrome>
      </BillingGate>
    </div>
  )
}
