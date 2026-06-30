"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const TABS = [
  { label: "Claim Request", href: "/hr-lounge/claims" },
  { label: "Settings", href: "/hr-lounge/claims/settings" },
]

// Sub-tab nav for the HR Lounge Expense Claims module (Claim Request | Settings).
export function ClaimsTabs() {
  const pathname = usePathname()
  return (
    <div className="border-b px-4 lg:px-6">
      <nav className="flex gap-6">
        {TABS.map((t) => {
          const active =
            t.href === "/hr-lounge/claims"
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
