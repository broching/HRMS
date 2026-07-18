"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { useCurrentMember } from "@/hooks/use-current-member"
import { permitted } from "@/convex/lib/permissions"
import type { HrmsRole } from "@/convex/lib/enums"
import { cn } from "@/lib/utils"
import {
  resolveSection,
  activeItemUrl,
  type NavLink,
} from "@/components/layout/nav-config"

function canSee(
  item: NavLink,
  role: HrmsRole | undefined,
  permissions: readonly string[] | undefined,
  modules: readonly string[] | undefined,
): boolean {
  if (!role) return false
  if (item.roles && !item.roles.includes(role)) return false
  if (item.permission && !permitted(permissions, item.permission)) return false
  if (item.module && !(modules ?? []).includes(item.module)) return false
  return true
}

export function SubNav() {
  const pathname = usePathname()
  const member = useCurrentMember()
  const role = member?.role

  const section = resolveSection(pathname)
  if (!section) return null

  const items = section.items.filter((i) =>
    canSee(i, role, member?.permissions, member?.enabledModules),
  )
  if (items.length < 2) return null

  const activeUrl = activeItemUrl(section, pathname)

  return (
    <div className="bg-background sticky top-16 z-30 border-b">
      <div className="mx-auto w-full max-w-[1400px] px-4 lg:px-6">
        <nav className="-mb-px flex items-center gap-1 overflow-x-auto">
          {items.map((item) => {
            const isActive = item.url === activeUrl
            return (
              <Link
                key={item.url}
                href={item.url}
                className={cn(
                  "shrink-0 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition-colors",
                  isActive
                    ? "border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground border-transparent",
                )}
              >
                {item.title}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
