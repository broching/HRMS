"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import {
  IconPlus,
  IconSearch,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { PageHeader } from "@/components/shared/page-header"
import { cn } from "@/lib/utils"
import { useCurrentMember } from "@/hooks/use-current-member"
import { permitted } from "@/convex/lib/permissions"

const ALL = "all"
const PAGE_SIZE = 10

function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase()
}

export function EmployeeDirectory({
  actions,
}: {
  actions?: React.ReactNode
} = {}) {
  const [searchInput, setSearchInput] = React.useState("")
  const [search, setSearch] = React.useState("")
  const [departmentId, setDepartmentId] = React.useState<string>(ALL)
  const [officeId, setOfficeId] = React.useState<string>(ALL)
  const [joinedBefore, setJoinedBefore] = React.useState("")
  const [page, setPage] = React.useState(1)

  const member = useCurrentMember()
  const canManage = permitted(member?.permissions, "employees:manage")

  // Debounce the search box so we don't refire the query on every keystroke.
  React.useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 250)
    return () => clearTimeout(t)
  }, [searchInput])

  // Reset to the first page whenever a filter changes.
  React.useEffect(() => {
    setPage(1)
  }, [search, departmentId, officeId, joinedBefore])

  const departments = useQuery(api.departments.list) ?? []
  const offices = useQuery(api.offices.list) ?? []
  const employees = useQuery(api.employees.list, {
    search: search || undefined,
    departmentId:
      departmentId === ALL ? undefined : (departmentId as Id<"departments">),
    officeId: officeId === ALL ? undefined : (officeId as Id<"offices">),
    joinedBefore: joinedBefore || undefined,
  })

  const total = employees?.length ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const start = (current - 1) * PAGE_SIZE
  const pageRows = employees?.slice(start, start + PAGE_SIZE) ?? []

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Employee List"
        description="Your organization's people directory."
      >
        {canManage && (
          <Button asChild>
            <Link href="/employees/new">
              <IconPlus className="size-4" />
              Add new employee
            </Link>
          </Button>
        )}
        {actions}
      </PageHeader>

      <div className="flex flex-col gap-3 px-4 lg:flex-row lg:items-center lg:px-6">
        <div className="relative lg:max-w-xs lg:flex-1">
          <IconSearch className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search for name / ID"
            className="pl-8"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
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
        <div className="flex items-center gap-1">
          <Input
            type="date"
            aria-label="Joined before"
            className="w-full lg:w-44"
            value={joinedBefore}
            onChange={(e) => setJoinedBefore(e.target.value)}
          />
          {joinedBefore && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setJoinedBefore("")}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="px-4 lg:px-6">
        <p className="text-muted-foreground text-sm">
          {employees === undefined
            ? "Loading…"
            : total === 0
              ? "No employees found."
              : `Showing ${start + 1} – ${Math.min(start + PAGE_SIZE, total)} of ${total} employees`}
        </p>
      </div>

      <div className="mx-4 rounded-lg border lg:mx-6">
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
            {employees === undefined ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-9 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : pageRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-muted-foreground py-10 text-center"
                >
                  No employees found.
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((e) => (
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
                        <span className="flex items-center gap-2 font-medium">
                          <span className="hover:underline">
                            {e.preferredName ?? e.firstName} {e.lastName}
                          </span>
                          {e.isVacant && (
                            <Badge variant="outline" className="text-[10px]">
                              Vacant
                            </Badge>
                          )}
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

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-1 px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={current <= 1}
            onClick={() => setPage(current - 1)}
          >
            <IconChevronLeft className="size-4" />
          </Button>
          {Array.from({ length: pageCount }).map((_, i) => (
            <Button
              key={i}
              variant={current === i + 1 ? "default" : "ghost"}
              size="icon"
              className={cn("size-8 tabular-nums")}
              onClick={() => setPage(i + 1)}
            >
              {i + 1}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={current >= pageCount}
            onClick={() => setPage(current + 1)}
          >
            <IconChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
