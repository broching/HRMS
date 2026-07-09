"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import {
  IconPlus,
  IconSearch,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { getErrorMessage } from "@/lib/errors"
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

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  probation: "Probation",
  on_leave: "On leave",
  suspended: "Suspended",
  terminated: "Inactive",
}

export function EmployeeDirectory({
  actions,
  // When set (HR Lounge), the list doubles as member management: it shows a
  // Status column and — for callers with `members:manage` — an inline role
  // changer, replacing the standalone Members screen.
  memberControls = false,
}: {
  actions?: React.ReactNode
  memberControls?: boolean
} = {}) {
  const [searchInput, setSearchInput] = React.useState("")
  const [search, setSearch] = React.useState("")
  const [departmentId, setDepartmentId] = React.useState<string>(ALL)
  const [officeId, setOfficeId] = React.useState<string>(ALL)
  const [joinedBefore, setJoinedBefore] = React.useState("")
  const [page, setPage] = React.useState(1)

  const member = useCurrentMember()
  const canManage = permitted(member?.permissions, "employees:manage")
  const canManageMembers =
    memberControls && permitted(member?.permissions, "members:manage")

  // Member/role data for the inline role changer (HR Lounge only).
  const members = useQuery(
    api.members.list,
    canManageMembers ? {} : "skip",
  )
  const roles = useQuery(
    api.roles.assignable,
    canManageMembers ? {} : "skip",
  )
  const setRoleId = useMutation(api.members.setRoleId)
  const ensureSeeded = useMutation(api.roles.ensureSeeded)

  // Make sure the preset roles exist so the role dropdown is never empty.
  React.useEffect(() => {
    if (canManageMembers) ensureSeeded().catch(() => {})
  }, [canManageMembers, ensureSeeded])

  // Map an employee to its membership, and resolve a role selection: the
  // member's explicit roleId, or the preset matching their legacy role enum.
  const memberByEmployee = React.useMemo(
    () =>
      new Map(
        (members ?? [])
          .filter((m) => m.employeeId)
          .map((m) => [m.employeeId as Id<"employees">, m]),
      ),
    [members],
  )
  const presetByKey = React.useMemo(
    () =>
      new Map(
        (roles ?? []).filter((r) => r.key).map((r) => [r.key as string, r._id]),
      ),
    [roles],
  )

  async function handleRoleChange(
    memberId: Id<"members">,
    roleId: Id<"roles">,
  ) {
    try {
      await setRoleId({ memberId, roleId })
      toast.success("Role updated")
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not update role"))
    }
  }

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

  const colCount = 5 + (memberControls ? 1 : 0) + (canManageMembers ? 1 : 0)

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
              {memberControls && <TableHead>Status</TableHead>}
              {canManageMembers && (
                <TableHead className="w-[180px]">Role</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees === undefined ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={colCount}>
                    <Skeleton className="h-9 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : pageRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={colCount}
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
                  {memberControls && (
                    <TableCell>
                      <Badge
                        variant={
                          e.status === "active" ? "secondary" : "outline"
                        }
                      >
                        {STATUS_LABEL[e.status] ?? e.status}
                      </Badge>
                    </TableCell>
                  )}
                  {canManageMembers && (
                    <TableCell>
                      {(() => {
                        const m = memberByEmployee.get(e._id)
                        if (!m) {
                          return (
                            <span className="text-muted-foreground text-xs">
                              No account
                            </span>
                          )
                        }
                        return (
                          <Select
                            value={
                              m.roleId ?? presetByKey.get(m.role) ?? undefined
                            }
                            onValueChange={(roleId) =>
                              handleRoleChange(
                                m.memberId,
                                roleId as Id<"roles">,
                              )
                            }
                          >
                            <SelectTrigger className="w-[170px]">
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                              {(roles ?? []).map((r) => (
                                <SelectItem key={r._id} value={r._id}>
                                  {r.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )
                      })()}
                    </TableCell>
                  )}
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
