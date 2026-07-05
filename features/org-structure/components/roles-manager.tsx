"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import {
  IconPlus,
  IconTrash,
  IconChevronRight,
  IconChevronDown,
  IconLock,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import {
  PERMISSIONS,
  PERMISSION_META,
  PERMISSION_MODULES,
  type Permission,
} from "@/convex/lib/permissions"
import { useHasPermission } from "@/hooks/use-permission"
import { getErrorMessage } from "@/lib/errors"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

type Role = FunctionReturnType<typeof api.roles.list>[number]

// Permissions grouped by their module, in the canonical module order.
const PERMISSIONS_BY_MODULE = PERMISSION_MODULES.map((module) => ({
  module,
  permissions: PERMISSIONS.filter((p) => PERMISSION_META[p].module === module),
})).filter((g) => g.permissions.length > 0)

// A grid of permission checkboxes grouped by module. Read-only when `disabled`.
function PermissionGrid({
  selected,
  onToggle,
  disabled,
}: {
  selected: Set<Permission>
  onToggle?: (permission: Permission, checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {PERMISSIONS_BY_MODULE.map(({ module, permissions }) => (
        <div key={module} className="flex flex-col gap-2">
          <span className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
            {module}
          </span>
          {permissions.map((p) => (
            <label
              key={p}
              className={cn(
                "flex items-start gap-2 text-sm",
                disabled ? "cursor-default" : "cursor-pointer",
              )}
            >
              <Checkbox
                className="mt-0.5"
                checked={selected.has(p)}
                disabled={disabled}
                onCheckedChange={(c) => onToggle?.(p, c === true)}
              />
              <span>
                <span className="font-medium">{PERMISSION_META[p].label}</span>
                <span className="text-muted-foreground block text-xs">
                  {PERMISSION_META[p].description}
                </span>
              </span>
            </label>
          ))}
        </div>
      ))}
    </div>
  )
}

// One role card: header (name, badges, count) + expandable permission editor.
function RoleCard({ role }: { role: Role }) {
  const updateRole = useMutation(api.roles.update)
  const removeRole = useMutation(api.roles.remove)
  const [expanded, setExpanded] = React.useState(false)
  const [name, setName] = React.useState(role.name)
  const [selected, setSelected] = React.useState<Set<Permission>>(
    () => new Set(role.permissions as Permission[]),
  )
  const [busy, setBusy] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  // Preset roles (Admin, HR, Finance, Manager, Employee) have fixed permissions
  // and can't be edited — customize access by creating a custom role instead.
  const locked = role.isPreset

  // Re-sync local edit state whenever the underlying role changes.
  React.useEffect(() => {
    setName(role.name)
    setSelected(new Set(role.permissions as Permission[]))
  }, [role.name, role.permissions])

  const dirty =
    name.trim() !== role.name ||
    selected.size !== role.permissions.length ||
    role.permissions.some((p) => !selected.has(p as Permission))

  function toggle(permission: Permission, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(permission)
      else next.delete(permission)
      return next
    })
  }

  async function save() {
    setBusy(true)
    try {
      await updateRole({
        roleId: role._id,
        name: name.trim(),
        permissions: [...selected],
      })
      toast.success("Role updated")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't update role"))
    } finally {
      setBusy(false)
    }
  }

  async function del() {
    setBusy(true)
    try {
      await removeRole({ roleId: role._id })
      toast.success("Role deleted")
      setConfirmDelete(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't delete role"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {expanded ? (
              <IconChevronDown className="text-muted-foreground size-4" />
            ) : (
              <IconChevronRight className="text-muted-foreground size-4" />
            )}
            <CardTitle className="flex items-center gap-2">
              {role.name}
              {role.isPreset && <Badge variant="secondary">Preset</Badge>}
              {locked && (
                <IconLock
                  className="text-muted-foreground size-3.5"
                  aria-label="Locked"
                />
              )}
            </CardTitle>
          </div>
          <Badge variant="outline">
            {role.assignedCount} member{role.assignedCount === 1 ? "" : "s"}
          </Badge>
        </div>
        {role.description && (
          <p className="text-muted-foreground ml-6 text-sm">{role.description}</p>
        )}
      </CardHeader>
      {expanded && (
        <CardContent className="flex flex-col gap-4">
          {!locked && (
            <div className="flex flex-col gap-1.5">
              <Label>Role name</Label>
              <Input
                className="max-w-xs"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}
          <PermissionGrid
            selected={selected}
            onToggle={locked ? undefined : toggle}
            disabled={locked}
          />
          {locked ? (
            <p className="text-muted-foreground text-sm">
              Preset roles have fixed permissions and can&apos;t be changed.
              Create a custom role to tailor access.
            </p>
          ) : (
            <div className="flex items-center justify-between gap-2">
              {!role.isPreset ? (
                <Button
                  variant="outline"
                  className="text-destructive"
                  disabled={busy}
                  onClick={() => setConfirmDelete(true)}
                >
                  <IconTrash className="size-4" />
                  Delete role
                </Button>
              ) : (
                <span />
              )}
              <Button disabled={busy || !dirty} onClick={save}>
                {busy ? "Saving…" : "Save changes"}
              </Button>
            </div>
          )}
        </CardContent>
      )}

      <Dialog open={confirmDelete} onOpenChange={(o) => !busy && setConfirmDelete(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete “{role.name}”?</DialogTitle>
            <DialogDescription>
              {role.assignedCount > 0
                ? `This role is assigned to ${role.assignedCount} member${role.assignedCount === 1 ? "" : "s"}. Reassign them first — deletion is blocked while anyone holds it.`
                : "This permanently removes the role. This can't be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmDelete(false)}
            >
              {role.assignedCount > 0 ? "Close" : "Cancel"}
            </Button>
            {role.assignedCount === 0 && (
              <Button variant="destructive" disabled={busy} onClick={del}>
                {busy ? "Deleting…" : "Delete role"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function CreateRoleDialog() {
  const createRole = useMutation(api.roles.create)
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [selected, setSelected] = React.useState<Set<Permission>>(new Set())
  const [busy, setBusy] = React.useState(false)

  function reset() {
    setName("")
    setDescription("")
    setSelected(new Set())
  }

  function toggle(permission: Permission, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(permission)
      else next.delete(permission)
      return next
    })
  }

  async function create() {
    if (!name.trim()) {
      toast.error("Give the role a name.")
      return
    }
    setBusy(true)
    try {
      await createRole({
        name: name.trim(),
        description: description.trim() || undefined,
        permissions: [...selected],
      })
      toast.success("Role created")
      reset()
      setOpen(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't create role"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!busy) {
          setOpen(o)
          if (!o) reset()
        }
      }}
    >
      <Button onClick={() => setOpen(true)}>
        <IconPlus className="size-4" />
        New role
      </Button>
      <DialogContent className="max-h-[90vh] w-[95vw] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create a custom role</DialogTitle>
          <DialogDescription>
            Pick the modules and actions this role can access. Assign it to
            members from Settings → Members.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Role name</Label>
              <Input
                value={name}
                placeholder="e.g. Claims Approver"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Description (optional)</Label>
              <Input
                value={description}
                placeholder="What this role is for"
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <PermissionGrid selected={selected} onToggle={toggle} />
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={create}>
            {busy ? "Creating…" : "Create role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function RolesManager() {
  const canManage = useHasPermission("roles:manage")
  const ensureSeeded = useMutation(api.roles.ensureSeeded)
  const roles = useQuery(api.roles.list, canManage ? {} : "skip")

  // Seed the preset roles the first time an admin opens this section.
  React.useEffect(() => {
    if (canManage) ensureSeeded().catch(() => {})
  }, [canManage, ensureSeeded])

  if (canManage === undefined) {
    return (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }
  if (!canManage) {
    return (
      <p className="text-muted-foreground px-4 text-sm lg:px-6">
        You don&apos;t have permission to manage roles.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Roles &amp; permissions</h2>
          <p className="text-muted-foreground text-sm">
            Control which modules each role can access. Assign roles to people in
            Settings → Members.
          </p>
        </div>
        <CreateRoleDialog />
      </div>
      {roles === undefined ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="flex flex-col gap-3">
          {roles.map((role) => (
            <RoleCard key={role._id} role={role} />
          ))}
        </div>
      )}
    </div>
  )
}
