"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  IconBuilding,
  IconCalendarStats,
  IconCalendarWeek,
  IconCash,
  IconChecklist,
  IconClockHour4,
  IconDashboard,
  IconFileDollar,
  IconPlane,
  IconReceipt,
  IconReceipt2,
  IconSitemap,
  IconTarget,
  IconTargetArrow,
  IconTimeline,
  IconUsers,
  IconUsersGroup,
  IconUserCircle,
  type Icon,
} from "@tabler/icons-react"
import { OrganizationSwitcher } from "@clerk/nextjs"
import { dark } from "@clerk/themes"
import { useTheme } from "next-themes"

import { NavMain } from "@/components/layout/nav-main"
import { NavUser } from "@/components/layout/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useCurrentMember } from "@/hooks/use-current-member"
import { hasPermission, type Permission } from "@/convex/lib/permissions"
import type { HrmsRole } from "@/convex/lib/enums"

type NavItem = {
  title: string
  url: string
  icon: Icon
  permission?: Permission
  roles?: HrmsRole[]
}

// Primary modules. New HRMS modules (Employees, Leave, …) are added here as
// each milestone lands. Items without a `permission` are visible to everyone.
const MODULES: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: IconDashboard },
  {
    title: "Employees",
    url: "/employees",
    icon: IconUserCircle,
    permission: "employees:read:all",
  },
  { title: "Leave", url: "/leave", icon: IconPlane },
  {
    title: "Leave approvals",
    url: "/leave/requests",
    icon: IconChecklist,
    roles: ["admin", "hr", "manager"],
  },
  { title: "Team calendar", url: "/leave/calendar", icon: IconCalendarStats },
  { title: "Claims", url: "/claims", icon: IconReceipt },
  {
    title: "Claim approvals",
    url: "/claims/requests",
    icon: IconReceipt2,
    roles: ["admin", "hr", "manager"],
  },
  { title: "Attendance", url: "/attendance", icon: IconClockHour4 },
  {
    title: "Team attendance",
    url: "/attendance/team",
    icon: IconUsersGroup,
    roles: ["admin", "hr", "manager"],
  },
  { title: "My schedule", url: "/scheduling", icon: IconCalendarWeek },
  {
    title: "Roster",
    url: "/scheduling/roster",
    icon: IconTimeline,
    roles: ["admin", "hr", "manager"],
  },
  { title: "Payslips", url: "/payslips", icon: IconFileDollar },
  {
    title: "Payroll",
    url: "/payroll",
    icon: IconCash,
    permission: "payroll:manage",
  },
  { title: "Performance", url: "/performance", icon: IconTargetArrow },
  {
    title: "Team reviews",
    url: "/performance/team",
    icon: IconTarget,
    roles: ["admin", "hr", "manager"],
  },
]

// Configuration area, gated by permission.
const SETTINGS: NavItem[] = [
  {
    title: "Organization",
    url: "/settings/organization",
    icon: IconBuilding,
    permission: "org:manage",
  },
  {
    title: "Members",
    url: "/settings/members",
    icon: IconUsers,
    permission: "members:manage",
  },
  {
    title: "Org structure",
    url: "/settings/org-structure",
    icon: IconSitemap,
    permission: "employees:manage",
  },
  {
    title: "Leave types",
    url: "/settings/leave-types",
    icon: IconPlane,
    permission: "leave:config",
  },
  {
    title: "Claim types",
    url: "/settings/claim-types",
    icon: IconReceipt,
    permission: "claims:approve:finance",
  },
  {
    title: "Attendance",
    url: "/settings/attendance",
    icon: IconClockHour4,
    permission: "attendance:config",
  },
  {
    title: "Shift templates",
    url: "/settings/shift-templates",
    icon: IconCalendarWeek,
    permission: "scheduling:manage",
  },
  {
    title: "Review cycles",
    url: "/settings/review-cycles",
    icon: IconTargetArrow,
    permission: "performance:manage",
  },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const { theme } = useTheme()
  const member = useCurrentMember()
  const role = member?.role

  const canSee = (item: NavItem) => {
    if (item.roles) return role != null && item.roles.includes(role)
    if (item.permission) return role != null && hasPermission(role, item.permission)
    return true
  }

  const visibleModules = MODULES.filter(canSee)
  const visibleSettings = SETTINGS.filter(canSee)

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <div className="px-1 py-1.5">
          <OrganizationSwitcher
            hidePersonal
            afterSelectOrganizationUrl="/dashboard"
            afterCreateOrganizationUrl="/dashboard"
            appearance={{
              baseTheme: theme === "dark" ? dark : undefined,
              elements: {
                rootBox: "w-full",
                organizationSwitcherTrigger: "w-full justify-start",
              },
            }}
          />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={visibleModules} />
        {visibleSettings.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Settings</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleSettings.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === item.url}
                      tooltip={item.title}
                    >
                      <Link href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
