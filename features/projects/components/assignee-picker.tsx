"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import { IconSearch, IconUser } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type EmployeeId = Id<"employees">

/**
 * Multi-select list of employees, used to assign people to a project or task.
 * Loads the org directory once and filters client-side. Selected people show as
 * removable chips above a searchable, scrollable checklist.
 */
export function AssigneePicker({
  value,
  onChange,
  emptyHint = "No one assigned yet.",
}: {
  value: EmployeeId[]
  onChange: (next: EmployeeId[]) => void
  emptyHint?: string
}) {
  const employees = useQuery(api.employees.list, {})
  const [search, setSearch] = React.useState("")

  const selected = React.useMemo(() => new Set(value), [value])

  const nameFor = React.useCallback(
    (id: EmployeeId) => {
      const e = employees?.find((x) => x._id === id)
      if (!e) return "—"
      return `${e.preferredName ?? e.firstName} ${e.lastName}`.trim()
    },
    [employees],
  )

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = employees ?? []
    if (!q) return list
    return list.filter((e) =>
      `${e.preferredName ?? e.firstName} ${e.lastName} ${e.employeeNumber}`
        .toLowerCase()
        .includes(q),
    )
  }, [employees, search])

  function toggle(id: EmployeeId) {
    if (selected.has(id)) onChange(value.filter((x) => x !== id))
    else onChange([...value, id])
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((id) => (
            <Badge
              key={id}
              variant="secondary"
              className="gap-1 pr-1 text-xs font-normal"
            >
              {nameFor(id)}
              <button
                type="button"
                aria-label={`Remove ${nameFor(id)}`}
                onClick={() => toggle(id)}
                className="hover:text-destructive ml-0.5"
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="relative">
        <IconSearch className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search people…"
          className="pl-8"
        />
      </div>

      <div className="max-h-48 overflow-y-auto rounded-md border">
        {employees === undefined ? (
          <div className="flex flex-col gap-2 p-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground flex items-center gap-2 px-3 py-4 text-xs">
            <IconUser className="size-3.5" />
            {employees.length === 0 ? emptyHint : "No matches."}
          </p>
        ) : (
          <ul className="divide-y">
            {filtered.map((e) => {
              const name = `${e.preferredName ?? e.firstName} ${e.lastName}`.trim()
              const isOn = selected.has(e._id)
              return (
                <li key={e._id}>
                  <button
                    type="button"
                    onClick={() => toggle(e._id)}
                    className={cn(
                      "hover:bg-accent/50 flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
                      isOn && "bg-accent/40",
                    )}
                  >
                    <Checkbox checked={isOn} className="pointer-events-none" />
                    <span className="min-w-0 flex-1 truncate">{name}</span>
                    <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
                      {e.employeeNumber}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
