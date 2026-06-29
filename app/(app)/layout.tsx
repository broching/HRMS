import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { TopNav } from "@/components/layout/top-nav"
import { SubNav } from "@/components/layout/sub-nav"
import { LoadingBar } from "@/components/layout/loading-bar"
import { EnsureMembership } from "@/components/layout/ensure-membership"

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
      <SubNav />
      <main className="mx-auto w-full max-w-[1400px] flex-1 py-6">
        <div className="flex flex-col gap-4 md:gap-6">{children}</div>
      </main>
    </div>
  )
}
