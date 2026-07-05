"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { ROLE_PERMISSIONS } from "@/convex/lib/permissions"
import { getErrorMessage } from "@/lib/errors"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const ROLES = Object.keys(ROLE_PERMISSIONS) as Array<
  keyof typeof ROLE_PERMISSIONS
>

// HR/admin control on the employee profile: change the person's in-app role.
// Renders nothing until the employee is a linked org member (nothing to change
// before they've joined).
export function ProfileRoleSelect({
  employeeId,
}: {
  employeeId: Id<"employees">
}) {
  const info = useQuery(api.members.roleForEmployee, { employeeId })
  const setRole = useMutation(api.members.setRole)
  const [saving, setSaving] = React.useState(false)

  if (!info) return null

  const memberId = info.memberId

  async function onChange(role: (typeof ROLES)[number]) {
    setSaving(true)
    try {
      await setRole({ memberId, role })
      toast.success("Role updated")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't update role"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 lg:items-end">
      <span className="text-muted-foreground text-xs">Role</span>
      <Select
        value={info.role}
        onValueChange={(r) => onChange(r as (typeof ROLES)[number])}
        disabled={saving}
      >
        <SelectTrigger className="h-8 w-36 capitalize">
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
    </div>
  )
}
