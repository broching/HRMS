"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { IconSearch } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { CpfStatus } from "@/convex/lib/enums"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
import { SetCompensationDialog } from "./set-compensation-dialog"
import { CPF_STATUS_LABELS, formatMoney } from "@/features/payroll/lib/labels"

type Target = {
  employeeId: Id<"employees">
  name: string
  cpfStatus: CpfStatus | null
}

const ALL = "all"

export function CompensationManagement() {
  const rows = useQuery(api.compensation.overview)
  const [target, setTarget] = React.useState<Target | null>(null)
  const [search, setSearch] = React.useState("")
  const [dept, setDept] = React.useState(ALL)
  const [team, setTeam] = React.useState(ALL)
  const [pay, setPay] = React.useState(ALL) // all | set | unset

  // Distinct departments/teams present in the data, for the filter dropdowns.
  const departments = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const r of rows ?? []) {
      if (r.departmentId && r.departmentName) map.set(r.departmentId, r.departmentName)
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])
  const teams = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const r of rows ?? []) {
      if (r.teamId && r.teamName) map.set(r.teamId, r.teamName)
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [rows])

  const filtered = (rows ?? []).filter((r) => {
    if (dept !== ALL && r.departmentId !== dept) return false
    if (team !== ALL && r.teamId !== team) return false
    if (pay === "set" && r.baseMonthlyCents == null) return false
    if (pay === "unset" && r.baseMonthlyCents != null) return false
    if (search.trim()) {
      const hay = `${r.name} ${r.positionTitle ?? ""}`.toLowerCase()
      if (!hay.includes(search.trim().toLowerCase())) return false
    }
    return true
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 px-4 lg:flex-row lg:flex-wrap lg:items-center lg:px-6">
        <div className="relative lg:max-w-xs lg:flex-1">
          <IconSearch className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search name / position"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={dept} onValueChange={setDept}>
          <SelectTrigger className="w-full lg:w-48">
            <SelectValue placeholder="All departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All departments</SelectItem>
            {departments.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={team} onValueChange={setTeam}>
          <SelectTrigger className="w-full lg:w-44">
            <SelectValue placeholder="All teams" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All teams</SelectItem>
            {teams.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={pay} onValueChange={setPay}>
          <SelectTrigger className="w-full lg:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All pay</SelectItem>
            <SelectItem value="set">Pay set</SelectItem>
            <SelectItem value="unset">Pay not set</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mx-4 rounded-lg border lg:mx-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Base monthly</TableHead>
              <TableHead>CPF status</TableHead>
              <TableHead>Effective</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows === undefined ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-muted-foreground py-8 text-center"
                >
                  No matching employees.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.employeeId}>
                  <TableCell>
                    <div className="font-medium">{r.name}</div>
                    {r.positionTitle && (
                      <div className="text-muted-foreground text-xs">
                        {r.positionTitle}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.departmentName ?? "—"}
                    {r.teamName && (
                      <div className="text-muted-foreground text-xs">
                        {r.teamName}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {r.baseMonthlyCents != null && r.currency ? (
                      formatMoney(r.baseMonthlyCents, r.currency)
                    ) : (
                      <span className="text-muted-foreground">Not set</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.cpfStatus ? (
                      <Badge variant="outline">
                        {CPF_STATUS_LABELS[r.cpfStatus]}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.effectiveDate ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setTarget({
                          employeeId: r.employeeId,
                          name: r.name,
                          cpfStatus: r.cpfStatus,
                        })
                      }
                    >
                      {r.baseMonthlyCents != null ? "Update" : "Set pay"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {target && (
        <SetCompensationDialog
          open={target !== null}
          onOpenChange={(o) => !o && setTarget(null)}
          employeeId={target.employeeId}
          employeeName={target.name}
          defaultCpfStatus={target.cpfStatus}
        />
      )}
    </div>
  )
}
