"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type Tab = { label: string; href?: string; exact?: boolean; comingSoon?: boolean }

const TABS: Tab[] = [
  { label: "Dashboard", href: "/hr-lounge/performance", exact: true },
  { label: "Report", href: "/hr-lounge/performance/report" },
  { label: "Cycle Overview", href: "/hr-lounge/performance/cycles" },
  { label: "Competency", href: "/hr-lounge/performance/competency" },
  { label: "Trainings", comingSoon: true },
  { label: "Development Plan", comingSoon: true },
]

export function PerformanceTabs() {
  const pathname = usePathname()
  return (
    <div className="border-b px-4 lg:px-6">
      <nav className="flex gap-6 overflow-x-auto">
        {TABS.map((t) => {
          const active =
            !!t.href &&
            (t.exact ? pathname === t.href : pathname.startsWith(t.href))
          const className = cn(
            "border-b-2 pb-2.5 text-sm whitespace-nowrap transition-colors",
            active
              ? "border-primary text-foreground font-medium"
              : "text-muted-foreground hover:text-foreground border-transparent",
            t.comingSoon && "opacity-60",
          )
          if (t.comingSoon) {
            return (
              <button
                key={t.label}
                type="button"
                className={className}
                onClick={() => toast.info(`${t.label} is coming soon.`)}
              >
                {t.label}
              </button>
            )
          }
          return (
            <Link key={t.label} href={t.href!} className={className}>
              {t.label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
