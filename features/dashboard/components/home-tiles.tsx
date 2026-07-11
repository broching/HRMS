"use client"

import Link from "next/link"
import {
  IconAddressBook,
  IconCalendarStats,
  IconChevronRight,
  IconClockHour4,
  IconId,
  IconReceipt,
  IconFileInvoice,
  IconTargetArrow,
  IconFileDollar,
  type Icon,
} from "@tabler/icons-react"
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
  const tiles: Tile[] = [
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
      title: "Payment Requests",
      description: "Raise a request for payment",
      icon: IconFileInvoice,
      href: "/payment-requests",
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
    // On xl the column stretches to the profile card's height; capping the grid
    // at 85% of that keeps the tiles 15% shorter than the profile card.
    <div className="h-full">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:h-[85%] xl:grid-cols-3">
        {tiles.map((t) => {
        const inner = (
          <Card
            className={cn(
              "group h-full gap-0 p-4 transition-colors",
              t.href
                ? "hover:border-primary/40 hover:bg-accent/40 cursor-pointer"
                : "opacity-60",
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
    </div>
  )
}
