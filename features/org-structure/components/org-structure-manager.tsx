"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { IconTrash, IconPlus } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { OfficesManager } from "@/features/org-structure/components/offices-manager"

type Item = { id: string; label: string }

function CrudSection({
  title,
  placeholder,
  items,
  onAdd,
  onRemove,
}: {
  title: string
  placeholder: string
  items: Item[] | undefined
  onAdd: (value: string) => Promise<void>
  onRemove: (id: string) => Promise<void>
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
      toast.error(e instanceof Error ? e.message : "Could not add")
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
            <p className="text-muted-foreground p-3 text-sm">None yet.</p>
          ) : (
            items.map((it) => (
              <div
                key={it.id}
                className="flex items-center justify-between p-2 pl-3 text-sm"
              >
                <span>{it.label}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => onRemove(it.id)}
                >
                  <IconTrash className="size-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function OrgStructureManager() {
  const departments = useQuery(api.departments.list)
  const teams = useQuery(api.teams.list)
  const positions = useQuery(api.positions.list)

  const createDept = useMutation(api.departments.create)
  const removeDept = useMutation(api.departments.remove)
  const createTeam = useMutation(api.teams.create)
  const removeTeam = useMutation(api.teams.remove)
  const createPos = useMutation(api.positions.create)
  const removePos = useMutation(api.positions.remove)

  return (
    <div className="grid gap-4 px-4 lg:grid-cols-2 lg:px-6">
      <CrudSection
        title="Departments"
        placeholder="e.g. Engineering"
        items={departments?.map((d) => ({ id: d._id, label: d.name }))}
        onAdd={async (name) => {
          await createDept({ name })
        }}
        onRemove={async (id) => {
          await removeDept({ id: id as never })
        }}
      />
      <CrudSection
        title="Teams"
        placeholder="e.g. Platform"
        items={teams?.map((t) => ({ id: t._id, label: t.name }))}
        onAdd={async (name) => {
          await createTeam({ name })
        }}
        onRemove={async (id) => {
          await removeTeam({ id: id as never })
        }}
      />
      <CrudSection
        title="Positions"
        placeholder="e.g. Software Engineer"
        items={positions?.map((p) => ({ id: p._id, label: p.title }))}
        onAdd={async (title) => {
          await createPos({ title })
        }}
        onRemove={async (id) => {
          await removePos({ id: id as never })
        }}
      />
      <OfficesManager />
    </div>
  )
}
