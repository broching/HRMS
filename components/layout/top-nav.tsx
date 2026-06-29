"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { OrganizationSwitcher } from "@clerk/nextjs"
import { dark } from "@clerk/themes"
import { useTheme } from "next-themes"
import { IconMenu2, IconSettings } from "@tabler/icons-react"

import { useCurrentMember } from "@/hooks/use-current-member"
import { hasPermission } from "@/convex/lib/permissions"
import type { HrmsRole } from "@/convex/lib/enums"
import { cn } from "@/lib/utils"
import {
  SECTIONS,
  SETTINGS_SECTION,
  resolveSection,
  type NavLink,
  type NavSection,
} from "@/components/layout/nav-config"
import { NavUserMenu } from "@/components/layout/nav-user-menu"
import { PendingActions } from "@/components/layout/pending-actions"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

function canSee(item: NavLink | NavSection, role: HrmsRole | undefined): boolean {
  if (!role) return false
  if (item.roles && !item.roles.includes(role)) return false
  if (item.permission && !hasPermission(role, item.permission)) return false
  return true
}

export function TopNav() {
  const pathname = usePathname()
  const { theme } = useTheme()
  const member = useCurrentMember()
  const role = member?.role

  const active = resolveSection(pathname)
  const sections = SECTIONS.filter((s) => canSee(s, role))
  const settingsVisible = SETTINGS_SECTION.items.some((i) => canSee(i, role))

  return (
    <header className="bg-background sticky top-0 z-40 border-b">
      <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-3 px-4 lg:px-6">
        {/* Brand + org switcher */}
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="text-lg font-bold tracking-tight">
            HR<span className="text-primary">MS</span>
          </Link>
          <div className="hidden sm:block">
            <OrganizationSwitcher
              hidePersonal
              afterSelectOrganizationUrl="/dashboard"
              afterCreateOrganizationUrl="/dashboard"
              appearance={{
                baseTheme: theme === "dark" ? dark : undefined,
                elements: {
                  rootBox: "ml-1",
                  organizationSwitcherTrigger: "px-2 py-1",
                },
              }}
            />
          </div>
        </div>

        {/* Primary nav (desktop) */}
        <nav className="hidden flex-1 items-center justify-center gap-1 md:flex">
          {sections.map((s) => {
            const isActive = active?.key === s.key
            return (
              <Link
                key={s.key}
                href={s.url}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent",
                )}
              >
                {s.title}
              </Link>
            )
          })}
        </nav>

        {/* Right cluster */}
        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <PendingActions />
          {settingsVisible && (
            <Link
              href={SETTINGS_SECTION.url}
              aria-label="Settings"
              className={cn(
                "rounded-md p-1.5 transition-colors",
                active?.key === "settings"
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent",
              )}
            >
              <IconSettings className="size-5" />
            </Link>
          )}
          <NavUserMenu />

          {/* Mobile menu */}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Menu"
              className="text-muted-foreground hover:text-foreground rounded-md p-1.5 md:hidden"
            >
              <IconMenu2 className="size-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {sections.map((s) => (
                <DropdownMenuItem key={s.key} asChild>
                  <Link href={s.url}>
                    <s.icon className="size-4" />
                    {s.title}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
