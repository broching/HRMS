"use client"

import * as React from "react"
import Link from "next/link"
import { useClerk, useUser } from "@clerk/nextjs"
import { useTheme } from "next-themes"
import {
  IconUserCircle,
  IconLogout,
  IconMoon,
} from "@tabler/icons-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Switch } from "@/components/ui/switch"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function NavUserMenu() {
  const { signOut } = useClerk()
  const { resolvedTheme, setTheme } = useTheme()
  const { user } = useUser()

  // next-themes resolves the theme only after mount; avoid a hydration mismatch
  // on the toggle by treating pre-mount as light.
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const isDark = mounted && resolvedTheme === "dark"

  const initials =
    user?.fullName
      ?.split(" ")
      .map((n) => n.charAt(0))
      .slice(0, 2)
      .join("")
      .toUpperCase() ?? "ME"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="focus-visible:ring-ring rounded-full outline-none focus-visible:ring-2">
        <Avatar className="size-9">
          <AvatarImage src={user?.imageUrl || ""} alt={user?.fullName || ""} />
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate font-medium">{user?.fullName}</span>
          <span className="text-muted-foreground truncate text-xs font-normal">
            {user?.primaryEmailAddress?.emailAddress}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <IconUserCircle className="size-4" />
            My profile
          </Link>
        </DropdownMenuItem>
        <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
          <span className="flex items-center gap-2">
            <IconMoon className="size-4" />
            Dark mode
          </span>
          <Switch
            checked={isDark}
            onCheckedChange={(c) => setTheme(c ? "dark" : "light")}
            aria-label="Toggle dark mode"
          />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut({ redirectUrl: "/" })}>
          <IconLogout className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
