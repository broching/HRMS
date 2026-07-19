"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useAuth, useOrganizationList } from "@clerk/nextjs"
import { useQuery } from "convex/react"
import {
  IconChevronDown,
  IconBuilding,
  IconCheck,
  IconPlus,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

function initials(name: string) {
  return (
    name
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "OR"
  )
}

function OrgLogo({
  name,
  imageUrl,
  className,
}: {
  name: string
  imageUrl?: string | null
  className?: string
}) {
  return (
    <Avatar className={cn("size-7 rounded-md", className)}>
      <AvatarImage src={imageUrl ?? undefined} alt={name} />
      <AvatarFallback className="rounded-md text-[10px]">
        {name ? initials(name) : <IconBuilding className="size-4" />}
      </AvatarFallback>
    </Avatar>
  )
}

// Our own organization control — replaces Clerk's <OrganizationSwitcher /> so no
// Clerk-rendered org UI is shown. Displays the active org (name + logo from our
// backend) and, when the user belongs to several orgs, switches between them.
export function OrgSwitcher() {
  const router = useRouter()
  const { orgId } = useAuth()
  const org = useQuery(api.organizations.current)
  const { isLoaded, setActive, userMemberships } = useOrganizationList({
    userMemberships: { infinite: true },
  })
  const [switching, setSwitching] = React.useState(false)

  const memberships = userMemberships?.data ?? []
  const canSwitch = memberships.length > 1

  async function switchTo(id: string) {
    if (!setActive || id === orgId) return
    setSwitching(true)
    try {
      await setActive({ organization: id })
      router.push("/dashboard")
    } finally {
      setSwitching(false)
    }
  }

  if (org === undefined || !isLoaded) {
    return (
      <div className="flex items-center gap-2 px-3 py-2">
        <Skeleton className="size-7 rounded-md" />
        <Skeleton className="h-4 w-24" />
      </div>
    )
  }

  const name = org?.name ?? "Organization"

  // Single-org users get a plain, non-interactive display.
  if (!canSwitch) {
    return (
      <div className="flex items-center gap-2 px-2 py-2 sm:px-3">
        <OrgLogo name={name} imageUrl={org?.imageUrl} />
        <span className="text-foreground max-w-[32vw] truncate text-sm font-semibold sm:max-w-none">
          {name}
        </span>
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={switching}
        className="hover:bg-accent flex items-center gap-2 rounded-xl px-2 py-2 outline-none transition sm:px-3"
      >
        <OrgLogo name={name} imageUrl={org?.imageUrl} />
        <span className="text-foreground max-w-[28vw] truncate text-sm font-semibold sm:max-w-none">
          {name}
        </span>
        <IconChevronDown className="text-muted-foreground size-4 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {memberships.map((m) => {
          const active = m.organization.id === orgId
          return (
            <DropdownMenuItem
              key={m.organization.id}
              onClick={() => switchTo(m.organization.id)}
              className="gap-2"
            >
              <OrgLogo
                name={m.organization.name}
                imageUrl={m.organization.imageUrl}
                className="size-6"
              />
              <span className="flex-1 truncate">{m.organization.name}</span>
              {active && <IconCheck className="size-4" />}
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/onboarding?new=1")} className="gap-2">
          <span className="flex size-6 items-center justify-center">
            <IconPlus className="size-4" />
          </span>
          <span className="flex-1">Create new company</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
