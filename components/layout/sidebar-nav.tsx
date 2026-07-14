"use client"

import * as React from "react"
import Link from "next/link"
import { IconChevronDown, type Icon } from "@tabler/icons-react"
import { cn } from "@/lib/utils"

export type SidebarNavItem = {
  key: string
  label: string
  icon: Icon
  href?: string
  active?: boolean
  comingSoon?: boolean
  onClick?: () => void
}

// `label: undefined` = an ungrouped lead item (no header), e.g. Overview.
export type SidebarNavGroup = {
  key: string
  label?: string
  items: SidebarNavItem[]
}

/**
 * Grouped, collapsible sidebar navigation shared by the HR Lounge and Team
 * rails. On desktop each labelled group is a collapsible section (open state
 * persisted per `storageKey`); when the whole rail is `collapsed` to icons, the
 * headers hide and every item shows as an icon. On mobile the rail is a flat
 * horizontal scroller — group headers are hidden and all items are shown.
 */
export function SidebarNav({
  groups,
  collapsed,
  storageKey,
}: {
  groups: SidebarNavGroup[]
  collapsed: boolean
  storageKey: string
}) {
  // Collapsed groups (by key). Default: every group open.
  const [closed, setClosed] = React.useState<Record<string, boolean>>({})

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) setClosed(JSON.parse(raw))
    } catch {
      /* ignore */
    }
  }, [storageKey])

  const toggle = (key: string) =>
    setClosed((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })

  return (
    <nav className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0">
      {groups.map((group) => {
        const isClosed = !!closed[group.key]
        return (
          <div
            key={group.key}
            className="flex gap-1 lg:mt-1 lg:flex-col lg:gap-0.5 lg:first:mt-0"
          >
            {group.label && !collapsed && (
              <button
                type="button"
                onClick={() => toggle(group.key)}
                className="text-muted-foreground hover:text-foreground hidden items-center justify-between gap-2 rounded-md px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide uppercase transition-colors lg:flex"
              >
                <span>{group.label}</span>
                <IconChevronDown
                  className={cn(
                    "size-3.5 transition-transform",
                    isClosed && "-rotate-90",
                  )}
                />
              </button>
            )}
            {group.items.map((item) => (
              <SidebarLink
                key={item.key}
                item={item}
                collapsed={collapsed}
                // Hide on desktop when its group is collapsed (never on mobile,
                // and never when the whole rail is in icon mode).
                hiddenOnDesktop={!collapsed && !!group.label && isClosed}
              />
            ))}
          </div>
        )
      })}
    </nav>
  )
}

function SidebarLink({
  item,
  collapsed,
  hiddenOnDesktop,
}: {
  item: SidebarNavItem
  collapsed: boolean
  hiddenOnDesktop: boolean
}) {
  const content = (
    <span
      title={collapsed ? item.label : undefined}
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
        collapsed && "lg:justify-center lg:px-2",
        item.active
          ? "border-primary/20 bg-primary/10 text-primary font-medium"
          : "hover:bg-accent/50 border-transparent",
        item.comingSoon && "opacity-60",
      )}
    >
      <span className="flex items-center gap-2.5">
        <item.icon className="size-4 shrink-0" />
        <span className={cn(collapsed && "lg:hidden")}>{item.label}</span>
      </span>
      {item.comingSoon && !collapsed && (
        <span className="text-muted-foreground hidden text-[10px] lg:inline">
          Soon
        </span>
      )}
    </span>
  )

  const wrapperClass = cn(hiddenOnDesktop && "lg:hidden")

  if (item.href && !item.comingSoon) {
    return (
      <Link href={item.href} className={wrapperClass}>
        {content}
      </Link>
    )
  }
  return (
    <button type="button" onClick={item.onClick} className={cn("text-left", wrapperClass)}>
      {content}
    </button>
  )
}
