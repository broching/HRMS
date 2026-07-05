"use client"

import Link from "next/link"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import { IconUserPlus } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { ROLE_PERMISSIONS } from "@/convex/lib/permissions"
import { useCurrentMember } from "@/hooks/use-current-member"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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

const ROLES = Object.keys(ROLE_PERMISSIONS) as Array<
  keyof typeof ROLE_PERMISSIONS
>

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export default function MembersSettingsPage() {
  const me = useCurrentMember()
  const members = useQuery(api.members.list)
  const setRole = useMutation(api.members.setRole)

  // Server enforces this too; the UI check just avoids a confusing error state.
  const canManage =
    me?.role === "admin" || me?.role === "hr" || me?.role === "finance"

  async function handleRoleChange(
    memberId: Id<"members">,
    role: (typeof ROLES)[number],
  ) {
    try {
      await setRole({ memberId, role })
      toast.success("Role updated")
    } catch {
      toast.error("Could not update role")
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
          <p className="text-muted-foreground text-sm">
            Manage who belongs to this organization and their HRMS role. Add
            people from the directory — it invites them and creates their
            profile in one step.
          </p>
        </div>
        {canManage && (
          <Button asChild>
            <Link href="/employees/new">
              <IconUserPlus className="size-4" />
              Add person
            </Link>
          </Button>
        )}
      </div>

      {me !== undefined && !canManage ? (
        <p className="text-muted-foreground text-sm">
          You don&apos;t have permission to manage members.
        </p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Profile</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[180px]">Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members === undefined ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Skeleton className="h-8 w-48" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-20" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-16" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-8 w-40" />
                    </TableCell>
                  </TableRow>
                ))
              ) : members.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-muted-foreground text-center"
                  >
                    No members yet.
                  </TableCell>
                </TableRow>
              ) : (
                members.map((m) => (
                  <TableRow key={m.memberId}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={m.imageUrl ?? ""} alt={m.name} />
                          <AvatarFallback>{initials(m.name)}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{m.name}</span>
                          {(m.email ?? m.username) && (
                            <span className="text-muted-foreground text-xs">
                              {m.email ?? `@${m.username}`}
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {m.employeeId ? (
                        <Link
                          href={`/employees/${m.employeeId}`}
                          className="text-sm hover:underline"
                        >
                          View profile
                        </Link>
                      ) : (
                        <span className="text-muted-foreground text-sm">
                          No profile
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={m.status === "active" ? "secondary" : "outline"}
                      >
                        {m.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={m.role}
                        onValueChange={(role) =>
                          handleRoleChange(
                            m.memberId,
                            role as (typeof ROLES)[number],
                          )
                        }
                      >
                        <SelectTrigger className="w-[160px] capitalize">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r} className="capitalize">
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
