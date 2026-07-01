"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const TABS = [
  { label: "Statistics", href: "/hr-lounge/reports", exact: true },
  { label: "Report builder", href: "/hr-lounge/reports/builder" },
]

export function ReportsTabs() {
  const pathname = usePathname()
  return (
    <div className="border-b px-4 lg:px-6">
      <nav className="flex gap-6 overflow-x-auto">
        {TABS.map((t) => {
          const active = t.exact
            ? pathname === t.href
            : pathname.startsWith(t.href)
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "border-b-2 pb-2.5 text-sm whitespace-nowrap transition-colors",
                active
                  ? "border-primary text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground border-transparent",
              )}
            >
              {t.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
