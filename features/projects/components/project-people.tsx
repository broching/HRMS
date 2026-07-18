"use client"

import { getErrorMessage } from "@/lib/errors"
import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { IconUsers } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { formatMinutes } from "@/features/timesheets/lib/time"
import { initials, avatarTone } from "@/features/projects/lib/task"
import { AssigneePicker } from "@/features/projects/components/assignee-picker"

export function ProjectPeople({
  projectId,
  canManage,
  canManageProjects,
}: {
  projectId: Id<"projects">
  canManage: boolean
  canManageProjects: boolean
}) {
  const assigneesData = useQuery(api.projects.projectAssignees, { projectId })
  const overview = useQuery(
    api.projects.overview,
    canManageProjects ? { projectId } : "skip",
  )
  const assignProject = useMutation(api.projects.assignProject)

  const [editing, setEditing] = React.useState(false)
  const [team, setTeam] = React.useState<Id<"employees">[]>([])
  const [saving, setSaving] = React.useState(false)

  const loadedIds = React.useMemo(
    () => (assigneesData?.project ?? []).map((a) => a.employeeId),
    [assigneesData],
  )
  React.useEffect(() => setTeam(loadedIds), [loadedIds])

  const dirty =
    JSON.stringify([...team].sort()) !== JSON.stringify([...loadedIds].sort())

  async function save() {
    setSaving(true)
    try {
      await assignProject({ projectId, employeeIds: team })
      toast.success("Project team updated")
      setEditing(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't update the team."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-6 lg:px-6">
      {/* Project team */}
      <div className="flex flex-col gap-3 rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <Label className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <IconUsers className="size-3.5" />
            Project team ({loadedIds.length})
          </Label>
          {canManage && (
            <Button variant="ghost" size="sm" className="h-7" onClick={() => setEditing((e) => !e)}>
              {editing ? "Done" : "Edit"}
            </Button>
          )}
        </div>
        {editing ? (
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-[11px]">
              People on the project team see every task and can log time against the
              whole project.
            </p>
            <AssigneePicker value={team} onChange={setTeam} />
            {dirty && (
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save team"}
              </Button>
            )}
          </div>
        ) : loadedIds.length === 0 ? (
          <p className="text-muted-foreground text-xs">No one on the project team yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {(assigneesData?.project ?? []).map((a) => (
              <Badge key={a.employeeId} variant="secondary" className="font-normal">
                {a.name}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Workload — who is doing what */}
      {canManageProjects && (
        <div className="flex flex-col gap-2 rounded-xl border p-4">
          <Label className="text-muted-foreground text-xs">Workload</Label>
          {overview === undefined ? (
            <Skeleton className="h-32 w-full" />
          ) : overview.byEmployee.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              No assignments or logged time yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead className="text-right">Assigned</TableHead>
                  <TableHead className="text-right">Estimate</TableHead>
                  <TableHead className="text-right">Logged</TableHead>
                  <TableHead className="text-right">Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.byEmployee.map((e) => {
                  const pct = e.estimateMinutes
                    ? Math.min(100, Math.round((e.minutes / e.estimateMinutes) * 100))
                    : 0
                  const over = e.estimateMinutes > 0 && e.minutes > e.estimateMinutes
                  return (
                    <TableRow key={e.employeeId}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="size-6">
                            <AvatarFallback className={cn("text-[10px] font-medium", avatarTone(e.name))}>
                              {initials(e.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="truncate">{e.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{e.assigned}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {e.estimateMinutes ? formatMinutes(e.estimateMinutes) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMinutes(e.minutes)}
                      </TableCell>
                      <TableCell className="text-right">
                        {e.estimateMinutes ? (
                          <div className="flex items-center justify-end gap-2">
                            <div className="bg-muted h-1.5 w-16 overflow-hidden rounded-full">
                              <div
                                className={cn(
                                  "h-full rounded-full",
                                  over ? "bg-red-500" : "bg-primary",
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-muted-foreground w-9 text-right text-xs tabular-nums">
                              {pct}%
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  )
}
