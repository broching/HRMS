"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import {
  IconCalendarStats,
  IconChevronRight,
  IconClockPlay,
  IconReceipt2,
  IconFileInvoice,
  IconSearch,
  IconStars,
  IconUserPlus,
  IconUsersPlus,
  type Icon,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { WhoIsAway } from "@/features/dashboard/components/who-is-away"

const ALL = "all"

type TeamCard = {
  title: string
  description: string
  icon: Icon
  href?: string
}

const CARDS: TeamCard[] = [
  {
    title: "Team Leave",
    description: "Check your team leave planning",
    icon: IconCalendarStats,
    href: "/leave/calendar",
  },
  {
    title: "Team Performance",
    description: "Check your team goals for this quarter",
    icon: IconStars,
    href: "/performance/team",
  },
  {
    title: "Team Timesheets",
    description: "See time logged across your reporting line",
    icon: IconClockPlay,
    href: "/timesheets/team",
  },
  {
    title: "Onboarding",
    description: "Any new member joining your team?",
    icon: IconUserPlus,
  },
  {
    title: "Recruitment",
    description: "Hiring a new employee in your team?",
    icon: IconUsersPlus,
  },
  {
    title: "Expense Claims",
    description: "Check and approve your team's claims",
    icon: IconReceipt2,
    href: "/claims/requests",
  },
  {
    title: "Payment Requests",
    description: "Review and approve payment requests",
    icon: IconFileInvoice,
    href: "/payment-requests/requests",
  },
]

function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase()
}

export function TeamOverview() {
  const reports = useQuery(api.employees.myTeamRows)
  const departments = useQuery(api.departments.list) ?? []
  const offices = useQuery(api.offices.list) ?? []

  const [search, setSearch] = React.useState("")
  const [departmentId, setDepartmentId] = React.useState(ALL)
  const [officeId, setOfficeId] = React.useState(ALL)
  const [joinedBefore, setJoinedBefore] = React.useState("")

  const deptName = new Map(departments.map((d) => [d._id, d.name]))
  const officeName = new Map(offices.map((o) => [o._id, o.name]))

  const filtered = (reports ?? []).filter((e) => {
    if (departmentId !== ALL && deptName.get(departmentId as Id<"departments">) !== e.departmentName)
      return false
    if (officeId !== ALL && officeName.get(officeId as Id<"offices">) !== e.officeName)
      return false
    if (joinedBefore && e.joinDate > joinedBefore) return false
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      const hay = `${e.firstName} ${e.lastName} ${e.preferredName ?? ""} ${e.employeeNumber}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Cards — on lg the column stretches to the "Who's away" card height;
            capping the grid at 85% keeps the cards 15% shorter than it. */}
        <div className="h-full">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:h-[85%] xl:grid-cols-3">
          {CARDS.map((c) => {
            const inner = (
              <Card
                className={cn(
                  "group h-full p-5 transition-colors",
                  c.href
                    ? "hover:border-primary/40 hover:bg-accent/40 cursor-pointer"
                    : "opacity-70",
                )}
              >
                <div className="flex flex-col gap-6">
                  <c.icon className="text-primary size-8" stroke={1.5} />
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1 font-semibold">
                      {c.title}
                      {c.href ? (
                        <IconChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                      ) : (
                        <span className="text-muted-foreground ml-1 text-[10px] font-normal uppercase">
                          Coming soon
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground text-sm">
                      {c.description}
                    </p>
                  </div>
                </div>
              </Card>
            )
            return c.href ? (
              <Link key={c.title} href={c.href} className="block h-full">
                {inner}
              </Link>
            ) : (
              <div key={c.title} className="h-full">
                {inner}
              </div>
            )
          })}
        </div>
        </div>

        {/* Who's away */}
        <WhoIsAway />
      </div>

      {/* Direct reports */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative lg:max-w-xs lg:flex-1">
            <IconSearch className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              placeholder="Search for name / ID"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger className="w-full lg:w-48">
              <SelectValue placeholder="All departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d._id} value={d._id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={officeId} onValueChange={setOfficeId}>
            <SelectTrigger className="w-full lg:w-48">
              <SelectValue placeholder="All offices" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All offices</SelectItem>
              {offices.map((o) => (
                <SelectItem key={o._id} value={o._id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            aria-label="Joined before"
            className="w-full lg:w-44"
            value={joinedBefore}
            onChange={(e) => setJoinedBefore(e.target.value)}
          />
        </div>

        <p className="text-muted-foreground text-sm">
          {reports === undefined
            ? "Loading…"
            : `Showing ${filtered.length} of ${reports.length} direct report${reports.length === 1 ? "" : "s"}`}
        </p>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">ID</TableHead>
                <TableHead>Employee name</TableHead>
                <TableHead className="hidden md:table-cell">Department</TableHead>
                <TableHead className="hidden md:table-cell">Office</TableHead>
                <TableHead className="hidden lg:table-cell">Email</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports === undefined ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5}>
                      <Skeleton className="h-9 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-muted-foreground py-10 text-center"
                  >
                    No direct reports found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((e) => (
                  <TableRow key={e._id}>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {e.employeeNumber}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/employees/${e._id}`}
                        className="flex items-center gap-3"
                      >
                        <Avatar className="size-9">
                          <AvatarImage
                            src={e.photoUrl ?? undefined}
                            alt={`${e.firstName} ${e.lastName}`}
                          />
                          <AvatarFallback className="text-xs">
                            {initials(e.firstName, e.lastName)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="flex flex-col">
                          <span className="font-medium hover:underline">
                            {e.preferredName ?? e.firstName} {e.lastName}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {e.positionTitle ?? "—"}
                          </span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {e.departmentName ?? "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {e.officeName ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden lg:table-cell">
                      {e.workEmail ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
