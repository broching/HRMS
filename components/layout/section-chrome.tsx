"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
} from "@tabler/icons-react"

import { useCurrentMember } from "@/hooks/use-current-member"
import { permitted } from "@/convex/lib/permissions"
import type { HrmsRole } from "@/convex/lib/enums"
import { cn } from "@/lib/utils"
import {
  resolveSection,
  activeItemUrl,
  type NavLink,
  type NavSection,
} from "@/components/layout/nav-config"
import { SubNav } from "@/components/layout/sub-nav"

function canSee(
  item: Pick<NavLink, "roles" | "permission">,
  role: HrmsRole | undefined,
  permissions: readonly string[] | undefined,
): boolean {
  if (!role) return false
  if (item.roles && !item.roles.includes(role)) return false
  if (item.permission && !permitted(permissions, item.permission)) return false
  return true
}

/**
 * Chrome for the section's children: either a left sidebar rail (sections with
 * `layout: "sidebar"`, e.g. Team) or the horizontal sub-nav bar (the default).
 */
export function SectionChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const member = useCurrentMember()
  const role = member?.role
  const permissions = member?.permissions

  const section = resolveSection(pathname)
  // A section the caller isn't allowed into (e.g. a regular employee deep-
  // linking to /team) shows no chrome at all — the page's own guard renders the
  // message under just the top nav, mirroring HR Lounge.
  const sectionVisible = !!section && canSee(section, role, permissions)
  const items = sectionVisible
    ? section!.items.filter((i) => canSee(i, role, permissions))
    : []
  const useSidebar =
    sectionVisible && section!.layout === "sidebar" && items.length >= 2

  if (useSidebar) {
    return (
      <main className="mx-auto w-full max-w-[1400px] flex-1">
        <SectionSidebar
          section={section!}
          items={items}
          activeUrl={activeItemUrl(section!, pathname)}
        >
          {children}
        </SectionSidebar>
      </main>
    )
  }

  const hideChrome = !!section && !sectionVisible

  return (
    <>
      {!hideChrome && <SubNav />}
      <main className="mx-auto w-full max-w-[1400px] flex-1 py-6">
        <div className="flex flex-col gap-4 md:gap-6">{children}</div>
      </main>
    </>
  )
}

function SectionSidebar({
  section,
  items,
  activeUrl,
  children,
}: {
  section: NavSection
  items: NavLink[]
  activeUrl: string | null
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = React.useState(false)

  return (
    <div className="flex flex-col gap-6 py-4 lg:flex-row lg:gap-0">
      <aside
        className={cn(
          "px-4 transition-all duration-200 lg:shrink-0 lg:border-r lg:border-border/70 lg:pr-4 lg:pl-6",
          collapsed ? "lg:w-20" : "lg:w-60",
        )}
      >
        <div className="mb-3 flex items-center justify-between px-1">
          <Link
            href={section.url}
            className={cn("text-xl font-semibold", collapsed && "lg:sr-only")}
          >
            {section.title}
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="text-muted-foreground hover:bg-accent hover:text-foreground hidden size-8 shrink-0 items-center justify-center rounded-lg transition-colors lg:flex"
          >
            {collapsed ? (
              <IconLayoutSidebarLeftExpand className="size-5" />
            ) : (
              <IconLayoutSidebarLeftCollapse className="size-5" />
            )}
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
          {items.map((item) => {
            const active = item.url === activeUrl
            return (
              <Link key={item.url} href={item.url}>
                <span
                  title={collapsed ? item.title : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
                    collapsed && "lg:justify-center lg:px-2",
                    active
                      ? "border-primary/20 bg-primary/10 text-primary font-medium"
                      : "hover:bg-accent/50 border-transparent",
                  )}
                >
                  {item.icon && <item.icon className="size-4 shrink-0" />}
                  <span className={cn(collapsed && "lg:hidden")}>
                    {item.title}
                  </span>
                </span>
              </Link>
            )
          })}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 lg:pl-6">
        <div className="flex flex-col gap-4 md:gap-6">{children}</div>
      </div>
    </div>
  )
}
