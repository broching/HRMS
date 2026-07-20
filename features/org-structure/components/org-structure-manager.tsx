"use client"

import { getErrorMessage } from "@/lib/errors"
import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { IconTrash, IconPlus } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { OfficesManager } from "@/features/org-structure/components/offices-manager"

type Kind = "department" | "team" | "position"
const KIND_NOUN: Record<Kind, string> = {
  department: "department",
  team: "team",
  position: "position",
}

type PersonAvatar = { employeeId: string; name: string; photoUrl: string | null }
type Group = { id: string; label: string }
type Item = Group & { count: number; avatars: PersonAvatar[] }

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")
}

// A small overlapping avatar stack + a total count. The stack previews up to a
// handful of people; the count is the true total.
function PeoplePreview({ count, avatars }: { count: number; avatars: PersonAvatar[] }) {
  if (count === 0) {
    return <span className="text-muted-foreground text-xs">No one yet</span>
  }
  const extra = count - avatars.length
  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {avatars.map((a) => (
          <Avatar key={a.employeeId} className="ring-background size-6 ring-2">
            {a.photoUrl && <AvatarImage src={a.photoUrl} alt={a.name} />}
            <AvatarFallback className="text-[10px]">
              {initials(a.name)}
            </AvatarFallback>
          </Avatar>
        ))}
        {extra > 0 && (
          <span className="bg-muted text-muted-foreground ring-background flex size-6 items-center justify-center rounded-full text-[10px] font-medium ring-2">
            +{extra}
          </span>
        )}
      </div>
      <span className="text-muted-foreground text-xs">
        {count} {count === 1 ? "person" : "people"}
      </span>
    </div>
  )
}

// Popup to manage who belongs to a group (department / team / position). Members
// can be moved to another group of the same kind (or removed), and people not in
// the group can be added. Everything writes via `employees.quickUpdateJob`, and
// the panel query is reactive so lists refresh after each change.
function GroupMembersDialog({
  kind,
  group,
  groups,
  onClose,
}: {
  kind: Kind
  group: Group
  groups: Group[]
  onClose: () => void
}) {
  const panel = useQuery(api.orgStructure.groupPanel, {
    kind,
    id: group.id,
  })
  const quickUpdate = useMutation(api.employees.quickUpdateJob)
  const [search, setSearch] = React.useState("")
  const [busyId, setBusyId] = React.useState<string | null>(null)

  async function assign(employeeId: string, targetId: string | null) {
    setBusyId(employeeId)
    try {
      const base = { employeeId: employeeId as Id<"employees"> }
      if (kind === "department") {
        await quickUpdate({
          ...base,
          departmentId: targetId as Id<"departments"> | null,
        })
      } else if (kind === "team") {
        await quickUpdate({ ...base, teamId: targetId as Id<"teams"> | null })
      } else {
        await quickUpdate({
          ...base,
          positionId: targetId as Id<"positions"> | null,
        })
      }
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't update"))
    } finally {
      setBusyId(null)
    }
  }

  const candidates = (panel?.candidates ?? []).filter((c) =>
    c.name.toLowerCase().includes(search.trim().toLowerCase()),
  )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{group.label}</DialogTitle>
          <DialogDescription>
            Manage who is in this {KIND_NOUN[kind]} — reassign people or add
            others.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Current members */}
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Members
            </span>
            {panel === undefined ? (
              <Skeleton className="h-16 w-full" />
            ) : panel.members.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No one in this {KIND_NOUN[kind]} yet.
              </p>
            ) : (
              <div className="flex max-h-64 flex-col divide-y overflow-y-auto rounded-md border">
                {panel.members.map((m) => (
                  <div key={m.employeeId} className="flex items-center gap-2 p-2">
                    <Avatar className="size-7">
                      {m.photoUrl && <AvatarImage src={m.photoUrl} alt={m.name} />}
                      <AvatarFallback className="text-[10px]">
                        {initials(m.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{m.name}</div>
                      {m.jobTitle && (
                        <div className="text-muted-foreground truncate text-xs">
                          {m.jobTitle}
                        </div>
                      )}
                    </div>
                    <Select
                      value={group.id}
                      onValueChange={(val) =>
                        assign(m.employeeId, val === "__none__" ? null : val)
                      }
                      disabled={busyId === m.employeeId}
                    >
                      <SelectTrigger className="w-40" size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {groups.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.label}
                          </SelectItem>
                        ))}
                        <SelectItem value="__none__">
                          Remove from {KIND_NOUN[kind]}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add people */}
          <div className="flex flex-col gap-1.5">
            <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Add people
            </span>
            <Input
              placeholder="Search people…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="flex max-h-48 flex-col divide-y overflow-y-auto rounded-md border">
              {panel === undefined ? (
                <Skeleton className="h-12 w-full" />
              ) : candidates.length === 0 ? (
                <p className="text-muted-foreground p-3 text-sm">
                  {search ? "No matches." : "Everyone is already here."}
                </p>
              ) : (
                candidates.slice(0, 50).map((c) => (
                  <div key={c.employeeId} className="flex items-center gap-2 p-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{c.name}</div>
                      {c.jobTitle && (
                        <div className="text-muted-foreground truncate text-xs">
                          {c.jobTitle}
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === c.employeeId}
                      onClick={() => assign(c.employeeId, group.id)}
                    >
                      <IconPlus className="size-4" />
                      Add
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CrudSection({
  title,
  placeholder,
  items,
  emptyLabel,
  onAdd,
  onRemove,
  onManage,
}: {
  title: string
  placeholder: string
  items: Item[] | undefined
  emptyLabel: string
  onAdd: (value: string) => Promise<void>
  onRemove: (id: string) => Promise<void>
  onManage: (item: Item) => void
}) {
  const [value, setValue] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function add() {
    const v = value.trim()
    if (!v) return
    setBusy(true)
    try {
      await onAdd(v)
      setValue("")
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not add"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Input
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                add()
              }
            }}
          />
          <Button onClick={add} disabled={busy || !value.trim()}>
            <IconPlus className="size-4" />
            Add
          </Button>
        </div>
        <div className="divide-y rounded-md border">
          {items === undefined ? (
            <p className="text-muted-foreground p-3 text-sm">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground p-3 text-sm">{emptyLabel}</p>
          ) : (
            items.map((it) => {
              const occupied = it.count > 0
              const trash = (
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("size-7", occupied && "opacity-40")}
                  disabled={occupied}
                  onClick={() => onRemove(it.id)}
                >
                  <IconTrash className="size-4" />
                </Button>
              )
              return (
                <div
                  key={it.id}
                  className="flex items-center gap-2 p-2 pl-3 text-sm"
                >
                  <button
                    type="button"
                    onClick={() => onManage(it)}
                    className="hover:bg-muted/40 -mx-1 -my-0.5 flex min-w-0 flex-1 items-center justify-between gap-3 rounded px-1 py-0.5 text-left"
                    title="Manage members"
                  >
                    <span className="min-w-0 flex-1 truncate">{it.label}</span>
                    <PeoplePreview count={it.count} avatars={it.avatars} />
                  </button>
                  {occupied ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        {/* span wrapper so the tooltip works on a disabled button */}
                        <span tabIndex={0}>{trash}</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        Move everyone away before deleting
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    trash
                  )}
                </div>
              )
            })
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Merge the plain list (id + label) with headcount stats (count + avatars) into
// the enriched items the CrudSection renders. Missing groups read as empty.
function enrich(
  base: Group[] | undefined,
  stats: { id: string; count: number; avatars: PersonAvatar[] }[] | undefined,
): Item[] | undefined {
  if (base === undefined) return undefined
  const byId = new Map((stats ?? []).map((s) => [s.id, s]))
  return base.map((b) => {
    const s = byId.get(b.id)
    return { ...b, count: s?.count ?? 0, avatars: s?.avatars ?? [] }
  })
}

export function OrgStructureManager() {
  const departments = useQuery(api.departments.list)
  const teams = useQuery(api.teams.list)
  const positions = useQuery(api.positions.list)
  const counts = useQuery(api.orgStructure.headcounts)

  const createDept = useMutation(api.departments.create)
  const removeDept = useMutation(api.departments.remove)
  const createTeam = useMutation(api.teams.create)
  const removeTeam = useMutation(api.teams.remove)
  const createPos = useMutation(api.positions.create)
  const removePos = useMutation(api.positions.remove)

  const [manage, setManage] = React.useState<{
    kind: Kind
    group: Group
    groups: Group[]
  } | null>(null)

  const deptGroups: Group[] =
    departments?.map((d) => ({ id: d._id, label: d.name })) ?? []
  const teamGroups: Group[] = teams?.map((t) => ({ id: t._id, label: t.name })) ?? []
  const posGroups: Group[] =
    positions?.map((p) => ({ id: p._id, label: p.title })) ?? []

  async function handleRemove(fn: () => Promise<unknown>) {
    try {
      await fn()
      toast.success("Deleted")
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not delete"))
    }
  }

  return (
    <div className="grid gap-4 px-4 lg:grid-cols-2 lg:px-6">
      <CrudSection
        title="Departments"
        placeholder="e.g. Engineering"
        emptyLabel="No departments yet."
        items={enrich(deptGroups, counts?.departments)}
        onAdd={async (name) => {
          await createDept({ name })
        }}
        onRemove={(id) => handleRemove(() => removeDept({ id: id as never }))}
        onManage={(it) =>
          setManage({ kind: "department", group: it, groups: deptGroups })
        }
      />
      <CrudSection
        title="Teams"
        placeholder="e.g. Platform"
        emptyLabel="No teams yet."
        items={enrich(teamGroups, counts?.teams)}
        onAdd={async (name) => {
          await createTeam({ name })
        }}
        onRemove={(id) => handleRemove(() => removeTeam({ id: id as never }))}
        onManage={(it) =>
          setManage({ kind: "team", group: it, groups: teamGroups })
        }
      />
      <CrudSection
        title="Positions"
        placeholder="e.g. Software Engineer"
        emptyLabel="No positions yet."
        items={enrich(posGroups, counts?.positions)}
        onAdd={async (title) => {
          await createPos({ title })
        }}
        onRemove={(id) => handleRemove(() => removePos({ id: id as never }))}
        onManage={(it) =>
          setManage({ kind: "position", group: it, groups: posGroups })
        }
      />
      <OfficesManager />

      {manage && (
        <GroupMembersDialog
          kind={manage.kind}
          group={manage.group}
          groups={manage.groups}
          onClose={() => setManage(null)}
        />
      )}
    </div>
  )
}
