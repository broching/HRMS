"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { OrganizationSwitcher } from "@clerk/nextjs"
import { dark } from "@clerk/themes"
import { useTheme } from "next-themes"
import { IconMenu2, IconSettings } from "@tabler/icons-react"

import { useCurrentMember } from "@/hooks/use-current-member"
import { permitted } from "@/convex/lib/permissions"
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
import { NotificationCenter } from "@/components/layout/notification-center"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

function canSee(
  item: NavLink | NavSection,
  role: HrmsRole | undefined,
  permissions: readonly string[] | undefined,
): boolean {
  if (!role) return false
  if (item.roles && !item.roles.includes(role)) return false
  if (item.permission && !permitted(permissions, item.permission)) return false
  return true
}

export function TopNav() {
  const pathname = usePathname()
  const { theme } = useTheme()
  const member = useCurrentMember()
  const role = member?.role
  const permissions = member?.permissions

  const active = resolveSection(pathname)
  const sections = SECTIONS.filter((s) => canSee(s, role, permissions))
  const settingsVisible = SETTINGS_SECTION.items.some((i) =>
    canSee(i, role, permissions),
  )

  return (
<header className="sticky top-0 z-50 h-[65px] border-b border-border bg-background shadow-lg">
  <div className="flex h-full overflow-hidden">
    

    {/* ---------------------------------------------------------------- */}
    {/* LEFT PANEL */}
    {/* ---------------------------------------------------------------- */}

    <div className="relative flex w-[288px] shrink-0 items-center bg-background px-4">
      <Link
        href="/dashboard"
        className="text-2xl font-extrabold tracking-tight text-foreground"
      >
        Wiz<span className="text-sky-600 dark:text-sky-400">HR</span>
      </Link>

      <div className="mx-3 h-8 w-px bg-border" />

      <OrganizationSwitcher
        hidePersonal
        afterSelectOrganizationUrl="/dashboard"
        afterCreateOrganizationUrl="/dashboard"
        appearance={{
          baseTheme: theme === "dark" ? dark : undefined,
          elements: {
            rootBox: "ml-0",

            organizationSwitcherTrigger:
              "rounded-xl px-3 py-2 transition hover:bg-accent",

            organizationPreviewMainIdentifier:
              "font-semibold text-foreground",

            organizationPreviewTextContainer:
              "text-foreground",

            organizationSwitcherTriggerIcon:
              "text-muted-foreground",
          },
        }}
      />

      {/* Diagonal transition */}

      <div
        className="
          absolute
          -right-8
          top-0
          h-full
          w-16
          bg-background
          skew-x-[-20deg]
          border-r
          border-border
          z-10
        "
      />
    </div>

    {/* ---------------------------------------------------------------- */}
    {/* BLUE PANEL */}
    {/* ---------------------------------------------------------------- */}
    

    <div
      className="
        flex
        flex-1
        items-center
        pl-9
        pr-5

        bg-gradient-to-r
        from-sky-500
        via-blue-500
        to-indigo-500

        dark:from-slate-900
        dark:via-blue-950
        dark:to-slate-900
      "
    >
      {/* Center Nav */}

      <nav className="hidden flex-1 justify-center gap-2 md:flex">
        {sections.map((section) => {
          const isActive = active?.key === section.key

          return (
            <Link
              key={section.key}
              href={section.url}
              className={cn(
                "rounded-2xl px-5 py-2 text-sm font-semibold transition-all duration-300",

                isActive
                  ? "bg-white text-blue-700 shadow-xl ring-1 ring-white/40"
                  : "text-white/90 hover:bg-white/10 hover:text-white hover:scale-105"
              )}
            >
              {section.title}
            </Link>
          )
        })}
      </nav>

      {/* Right */}

      <div className="ml-auto flex items-center gap-2">
        <div className="rounded-xl border border-white/20 bg-white/10 p-1 backdrop-blur-md">
          <NotificationCenter />
        </div>

        {settingsVisible && (
          <Link
            href={SETTINGS_SECTION.url}
            className={cn(
              "rounded-xl p-2 transition-all duration-300",

              active?.key === "settings"
                ? "bg-white/20 text-white"
                : "text-white/90 hover:bg-white/10 hover:scale-110"
            )}
          >
            <IconSettings className="size-5" />
          </Link>
        )}

        <div className="rounded-xl p-1 transition-all duration-300 hover:bg-white/10 hover:scale-105">
          <NavUserMenu />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-xl p-2 text-white hover:bg-white/10 md:hidden">
            <IconMenu2 className="size-5" />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-52">
            {sections.map((section) => (
              <DropdownMenuItem key={section.key} asChild>
                <Link
                  href={section.url}
                  className="flex items-center gap-2"
                >
                  <section.icon className="size-4" />
                  {section.title}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  </div>
</header>
  )
}
