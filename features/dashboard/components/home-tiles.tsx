"use client"

import Link from "next/link"
import { useQuery } from "convex/react"
import {
  IconAddressBook,
  IconCalendarStats,
  IconChevronRight,
  IconClockHour4,
  IconClockPlay,
  IconCalendarTime,
  IconId,
  IconReceipt,
  IconFileInvoice,
  IconTargetArrow,
  IconFileDollar,
  type Icon,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { useEnabledModules } from "@/hooks/use-modules"
import type { ModuleKey } from "@/convex/lib/modules"

type Tile = {
  title: string
  description: string
  icon: Icon
  href?: string
  soon?: boolean
  // Product module this tile belongs to; hidden when the org lacks it.
  module?: ModuleKey
  // Draws attention (e.g. an open clock-in session that needs closing).
  highlight?: boolean
  // Priority order on mobile (single-column). Lower = higher. Tiles without one
  // fall in after the prioritized set, keeping their natural order. Reset to the
  // natural DOM order from `sm` up (see MOBILE_ORDER).
  mobileOrder?: number
}

// Static Tailwind order classes (JIT can't see interpolated ones). `sm:order-0`
// drops the override so the desktop grid uses natural DOM order.
const MOBILE_ORDER: Record<number, string> = {
  1: "order-1 sm:order-0",
  2: "order-2 sm:order-0",
  3: "order-3 sm:order-0",
  4: "order-4 sm:order-0",
  5: "order-5 sm:order-0",
  6: "order-6 sm:order-0",
}
const MOBILE_ORDER_REST = "order-7 sm:order-0"

export function HomeTiles() {
  // Attendance leads the grid when the caller must clock in/out (or is mid
  // session); otherwise it stays in its normal slot lower down.
  const attendance = useQuery(api.attendance.myAttendanceConfig)
  const modules = useEnabledModules()
  const attendanceLeads = Boolean(
    attendance && (attendance.required || attendance.hasOpenSession),
  )
  const attendanceTile: Tile = {
    title: "Attendance",
    description: attendance?.hasOpenSession
      ? "You're clocked in — tap to clock out"
      : "Clock in and out with the office QR code",
    icon: IconClockHour4,
    href: "/attendance",
    highlight: attendance?.hasOpenSession,
    mobileOrder: 1,
    module: "attendance",
  }

  const allTiles: Tile[] = [
    ...(attendanceLeads ? [attendanceTile] : []),
    {
      title: "My Profile",
      description: "Update and preview your personal profile",
      icon: IconId,
      href: "/profile",
    },
    {
      title: "Directory",
      description: "List of employees in the company",
      icon: IconAddressBook,
      href: "/employees",
    },
    {
      title: "My Leave",
      description: "Perform your leave management",
      icon: IconCalendarStats,
      href: "/leave",
      mobileOrder: 4,
      module: "leave",
    },
    {
      title: "My Goals",
      description: "Check your performance management and KPIs",
      icon: IconTargetArrow,
      href: "/performance",
      module: "performance",
    },
    {
      title: "Payroll Documents",
      description: "Access to all your payslips and forms",
      icon: IconFileDollar,
      href: "/payslips",
      mobileOrder: 5,
      module: "payroll",
    },
    {
      title: "My Claims",
      description: "Submit your expenses",
      icon: IconReceipt,
      href: "/claims",
      mobileOrder: 3,
      module: "claims",
    },
    {
      title: "Payment Requests",
      description: "Raise a request for payment",
      icon: IconFileInvoice,
      href: "/payment-requests",
      mobileOrder: 6,
      module: "payment_requests",
    },
    ...(attendanceLeads ? [] : [attendanceTile]),
    {
      title: "My Schedule",
      description: "Your upcoming shifts, working hours and overtime",
      icon: IconCalendarTime,
      href: "/scheduling",
      module: "attendance",
    },
    {
      title: "My Timesheet",
      description: "Log time against projects and tasks",
      icon: IconClockPlay,
      href: "/timesheets",
      mobileOrder: 2,
      module: "timesheets",
    },
    {
      title: "Team Calendar",
      description: "See who's away across your team",
      icon: IconCalendarStats,
      href: "/leave/calendar",
      module: "leave",
    },
  ]
  const tiles = allTiles.filter(
    (t) => !t.module || modules === undefined || modules.has(t.module),
  )

  return (
    // On xl the column stretches to the profile card's height; capping the grid
    // at 85% of that keeps the tiles 15% shorter than the profile card.
    <div className="h-full">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:h-[85%] xl:grid-cols-3">
        {tiles.map((t) => {
        const orderClass =
          t.mobileOrder != null ? MOBILE_ORDER[t.mobileOrder] : MOBILE_ORDER_REST
        const inner = (
          <Card
            className={cn(
              "group h-full gap-0 p-4 transition-colors",
              t.href
                ? "hover:border-primary/40 hover:bg-accent/40 cursor-pointer"
                : "opacity-60",
              t.highlight && "border-primary/50 bg-primary/5",
            )}
          >
            <div className="flex flex-col gap-3">
              <t.icon className="text-primary size-6" stroke={1.5} />
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1 font-semibold">
                  {t.title}
                  {t.href && (
                    <IconChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                  )}
                  {t.soon && (
                    <span className="text-muted-foreground ml-1 text-[10px] font-normal uppercase">
                      Soon
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground text-sm">{t.description}</p>
              </div>
            </div>
          </Card>
        )
        return t.href ? (
          <Link key={t.title} href={t.href} className={cn("block h-full", orderClass)}>
            {inner}
          </Link>
        ) : (
          <div key={t.title} className={cn("h-full", orderClass)}>
            {inner}
          </div>
        )
        })}
      </div>
    </div>
  )
}
