"use client"

import { usePathname } from "next/navigation"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

function getPageTitle(pathname: string): string {
  switch (pathname) {
    case "/dashboard":
      return "Dashboard"
    case "/dashboard/payment-gated":
      return "Payment gated"
    case "/settings/organization":
      return "Organization"
    case "/settings/members":
      return "Members"
    case "/settings/org-structure":
      return "Org structure"
    case "/settings/leave-types":
      return "Leave types & holidays"
    case "/settings/claim-types":
      return "Claim types"
    case "/settings/attendance":
      return "Attendance settings"
    case "/settings/shift-templates":
      return "Shift templates"
    case "/attendance":
      return "Attendance"
    case "/attendance/team":
      return "Team attendance"
    case "/scheduling":
      return "My schedule"
    case "/scheduling/roster":
      return "Roster"
    case "/payroll":
      return "Payroll"
    case "/payroll/compensation":
      return "Compensation"
    case "/payslips":
      return "My payslips"
    case "/settings/review-cycles":
      return "Review cycles"
    case "/performance":
      return "Performance"
    case "/performance/team":
      return "Team reviews"
    case "/employees/new":
      return "New employee"
    case "/leave":
      return "My leave"
    case "/leave/requests":
      return "Leave approvals"
    case "/leave/calendar":
      return "Team calendar"
    case "/claims":
      return "My claims"
    case "/claims/requests":
      return "Claim approvals"
    default:
      if (pathname.startsWith("/employees")) return "Employees"
      if (pathname.startsWith("/leave")) return "Leave"
      if (pathname.startsWith("/claims")) return "Claims"
      if (pathname.startsWith("/attendance")) return "Attendance"
      if (pathname.startsWith("/scheduling")) return "Schedule"
      if (pathname.startsWith("/payroll")) return "Payroll"
      if (pathname.startsWith("/payslips")) return "Payslips"
      if (pathname.startsWith("/performance")) return "Performance"
      if (pathname.startsWith("/settings")) return "Settings"
      return "Page"
  }
}

export function SiteHeader() {
  const pathname = usePathname()
  const pageTitle = getPageTitle(pathname)

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <h1 className="text-base font-medium">{pageTitle}</h1>
      </div>
    </header>
  )
}
