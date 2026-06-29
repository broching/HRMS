"use client"

import Link from "next/link"
import { useClerk, useUser } from "@clerk/nextjs"
import { dark } from "@clerk/themes"
import { useTheme } from "next-themes"
import {
  IconUserCircle,
  IconSettingsCog,
  IconLogout,
  IconMoon,
  IconSun,
} from "@tabler/icons-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function NavUserMenu() {
  const { openUserProfile, signOut } = useClerk()
  const { theme, setTheme } = useTheme()
  const { user } = useUser()

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
        <DropdownMenuItem
          onClick={() =>
            openUserProfile({
              appearance: { baseTheme: theme === "dark" ? dark : undefined },
            })
          }
        >
          <IconSettingsCog className="size-4" />
          Manage account
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? (
            <IconSun className="size-4" />
          ) : (
            <IconMoon className="size-4" />
          )}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut({ redirectUrl: "/" })}>
          <IconLogout className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
