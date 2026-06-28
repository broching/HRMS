import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { SiteHeader } from "@/components/layout/site-header"
import { LoadingBar } from "@/components/layout/loading-bar"
import { EnsureMembership } from "@/components/layout/ensure-membership"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"

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
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
      className="group/layout"
    >
      <EnsureMembership />
      <AppSidebar variant="inset" />
      <SidebarInset>
        <LoadingBar />
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              {children}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
