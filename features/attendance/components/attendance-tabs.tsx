"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const TABS = [
  { label: "Clock-ins", href: "/hr-lounge/attendance" },
  { label: "Configuration", href: "/hr-lounge/attendance/config" },
]

// Sub-tab nav for the HR Lounge Attendance module (Clock-ins | Configuration).
export function AttendanceTabs() {
  const pathname = usePathname()
  return (
    <div className="border-b px-4 lg:px-6">
      <nav className="flex gap-6">
        {TABS.map((t) => {
          const active =
            t.href === "/hr-lounge/attendance"
              ? pathname === t.href
              : pathname.startsWith(t.href)
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "border-b-2 pb-2.5 text-sm transition-colors",
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
