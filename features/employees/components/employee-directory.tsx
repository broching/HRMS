"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery } from "convex/react"
import { IconPlus, IconSearch } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { EmployeeStatus } from "@/convex/lib/enums"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
import {
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPE_LABELS,
  STATUS_BADGE,
  STATUS_LABELS,
} from "@/features/employees/lib/labels"

export function EmployeeDirectory() {
  const [searchInput, setSearchInput] = React.useState("")
  const [search, setSearch] = React.useState("")
  const [status, setStatus] = React.useState<EmployeeStatus | "all">("all")

  // Debounce the search box so we don't refire the query on every keystroke.
  React.useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 250)
    return () => clearTimeout(t)
  }, [searchInput])

  const employees = useQuery(api.employees.list, {
    search: search || undefined,
    status: status === "all" ? undefined : status,
  })

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Employees"
        description="Your organization's people directory."
      >
        <Button asChild>
          <Link href="/employees/new">
            <IconPlus className="size-4" />
            New employee
          </Link>
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-3 px-4 sm:flex-row sm:items-center lg:px-6">
        <div className="relative flex-1">
          <IconSearch className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search by name or employee number…"
            className="pl-8"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as EmployeeStatus | "all")}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {EMPLOYEE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mx-4 rounded-lg border lg:mx-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead className="hidden md:table-cell">Department</TableHead>
              <TableHead className="hidden md:table-cell">Position</TableHead>
              <TableHead className="hidden lg:table-cell">Type</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees === undefined ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : employees.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-muted-foreground py-10 text-center"
                >
                  No employees found.
                </TableCell>
              </TableRow>
            ) : (
              employees.map((e) => (
                <TableRow key={e._id} className="cursor-pointer">
                  <TableCell>
                    <Link
                      href={`/employees/${e._id}`}
                      className="flex flex-col"
                    >
                      <span className="font-medium">
                        {e.preferredName ?? e.firstName} {e.lastName}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {e.employeeNumber}
                        {e.workEmail ? ` · ${e.workEmail}` : ""}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {e.departmentName ?? "—"}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {e.positionTitle ?? "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {EMPLOYMENT_TYPE_LABELS[e.employmentType]}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[e.status]}>
                      {STATUS_LABELS[e.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
