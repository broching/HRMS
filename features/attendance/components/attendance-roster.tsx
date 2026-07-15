"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { toast } from "sonner"
import { IconSearch } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import { getErrorMessage } from "@/lib/errors"

const ALL = "__all__"

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("")
}

type Override = "default" | "required" | "exempt"

function toOverride(v: boolean | null): Override {
  return v === true ? "required" : v === false ? "exempt" : "default"
}

type RosterEntry = FunctionReturnType<typeof api.attendanceSettings.roster>[number]

function RosterRow({ row }: { row: RosterEntry }) {
  const setRequired = useMutation(api.attendanceSettings.setAttendanceRequired)
  const value = toOverride(row.attendanceRequired)

  async function change(next: Override) {
    if (!next || next === value) return
    try {
      await setRequired({
        employeeId: row._id,
        value: next === "required" ? true : next === "exempt" ? false : null,
      })
    } catch (e) {
      toast.error(
        getErrorMessage(e, "We couldn't update this person. Please try again."),
      )
    }
  }

  return (
    <div className="flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0">
      <Avatar className="size-8 shrink-0">
        {row.photoUrl && <AvatarImage src={row.photoUrl} alt={row.name} />}
        <AvatarFallback className="text-[11px] font-medium">
          {initials(row.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{row.name}</div>
        <div className="text-muted-foreground truncate text-xs">
          {[row.positionTitle, row.departmentName, row.teamName]
            .filter(Boolean)
            .join(" · ") || row.employeeNumber}
        </div>
      </div>
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(v) => change(v as Override)}
        variant="outline"
        size="sm"
        className="shrink-0"
      >
        <ToggleGroupItem value="required" className="px-2.5 text-xs">
          Required
        </ToggleGroupItem>
        <ToggleGroupItem value="exempt" className="px-2.5 text-xs">
          Exempt
        </ToggleGroupItem>
        <ToggleGroupItem value="default" className="px-2.5 text-xs">
          Default
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}

export function AttendanceRoster() {
  const rows = useQuery(api.attendanceSettings.roster)
  const departments = useQuery(api.departments.list) ?? []
  const teams = useQuery(api.teams.list) ?? []

  const [search, setSearch] = React.useState("")
  const [departmentId, setDepartmentId] = React.useState(ALL)
  const [teamId, setTeamId] = React.useState(ALL)

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return (rows ?? []).filter((r) => {
      if (departmentId !== ALL && r.departmentId !== departmentId) return false
      if (teamId !== ALL && r.teamId !== teamId) return false
      if (q && !r.name.toLowerCase().includes(q) &&
        !r.employeeNumber.toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, search, departmentId, teamId])

  return (
    <div className="px-4 lg:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Who takes attendance</CardTitle>
          <CardDescription>
            Set each person to Required, Exempt, or Default (follows the org
            setting above).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 p-0">
          <div className="flex flex-col gap-2 px-4 sm:flex-row sm:items-center">
            <div className="relative sm:max-w-xs sm:flex-1">
              <IconSearch className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                placeholder="Search people"
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger className="w-full sm:w-44">
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
            <Select value={teamId} onValueChange={setTeamId}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="All teams" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All teams</SelectItem>
                {teams.map((t) => (
                  <SelectItem key={t._id} value={t._id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="border-t">
            {rows === undefined ? (
              <div className="p-4">
                <Skeleton className="h-40 w-full" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-muted-foreground px-4 py-10 text-center text-sm">
                No one matches your filters.
              </p>
            ) : (
              <div className="max-h-[540px] overflow-y-auto">
                {filtered.map((r) => (
                  <RosterRow key={r._id} row={r} />
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
