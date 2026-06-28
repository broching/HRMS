"use client"

import Link from "next/link"
import { useQuery } from "convex/react"
import {
  IconAddressBook,
  IconCalendarStats,
  IconChevronRight,
  IconClockHour4,
  IconId,
  IconReceipt,
  IconTargetArrow,
  IconFileDollar,
  type Icon,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import { useCurrentMember } from "@/hooks/use-current-member"
import { hasPermission } from "@/convex/lib/permissions"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"

type Tile = {
  title: string
  description: string
  icon: Icon
  href?: string
  soon?: boolean
}

export function HomeTiles() {
  const member = useCurrentMember()
  const card = useQuery(api.employees.homeCard)
  const role = member?.role
  const canReadAll = role ? hasPermission(role, "employees:read:all") : false
  const myProfileHref =
    card && card.hasProfile ? `/employees/${card.employeeId}` : undefined

  const tiles: Tile[] = [
    {
      title: "My Profile",
      description: "Update and preview your personal profile",
      icon: IconId,
      href: myProfileHref,
    },
    {
      title: "Directory",
      description: "List of employees in the company",
      icon: IconAddressBook,
      href: canReadAll ? "/employees" : undefined,
      soon: !canReadAll,
    },
    {
      title: "My Leave",
      description: "Perform your leave management",
      icon: IconCalendarStats,
      href: "/leave",
    },
    {
      title: "My Goals",
      description: "Check your performance management and KPIs",
      icon: IconTargetArrow,
      href: "/performance",
    },
    {
      title: "Payroll Documents",
      description: "Access to all your payslips and forms",
      icon: IconFileDollar,
      href: "/payslips",
    },
    {
      title: "My Claims",
      description: "Submit your expenses",
      icon: IconReceipt,
      href: "/claims",
    },
    {
      title: "Attendance",
      description: "Clock in and out with the office QR code",
      icon: IconClockHour4,
      href: "/attendance",
    },
    {
      title: "Team Calendar",
      description: "See who's away across your team",
      icon: IconCalendarStats,
      href: "/leave/calendar",
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {tiles.map((t) => {
        const inner = (
          <Card
            className={cn(
              "group h-full p-5 transition-colors",
              t.href
                ? "hover:border-primary/40 hover:bg-accent/40 cursor-pointer"
                : "opacity-60",
            )}
          >
            <div className="flex flex-col gap-6">
              <t.icon className="text-primary size-8" stroke={1.5} />
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
          <Link key={t.title} href={t.href} className="block h-full">
            {inner}
          </Link>
        ) : (
          <div key={t.title} className="h-full">
            {inner}
          </div>
        )
      })}
    </div>
  )
}
