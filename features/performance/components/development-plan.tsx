"use client"

import * as React from "react"
import { useMutation, useQuery } from "convex/react"
import { IconPlus, IconX, IconDeviceFloppy } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type ActionItem = { label: string; done: boolean }

type PlanState = {
  shortTerm: string[]
  midTerm: string[]
  longTerm: string[]
  currentCompetencies: string[]
  developmentNeeds: string[]
  actionPlan: ActionItem[]
}

const EMPTY: PlanState = {
  shortTerm: [],
  midTerm: [],
  longTerm: [],
  currentCompetencies: [],
  developmentNeeds: [],
  actionPlan: [],
}

type ListKey = Exclude<keyof PlanState, "actionPlan">

export function DevelopmentPlan({
  employeeId,
}: {
  employeeId?: Id<"employees">
}) {
  const mineData = useQuery(
    api.developmentPlans.mine,
    employeeId ? "skip" : {},
  )
  const empData = useQuery(
    api.developmentPlans.forEmployee,
    employeeId ? { employeeId } : "skip",
  )
  const data = employeeId ? empData : mineData
  const save = useMutation(api.developmentPlans.save)

  const [state, setState] = React.useState<PlanState>(EMPTY)
  const [dirty, setDirty] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const loadedKey = React.useRef<string | null>(null)

  // Seed local state once the query resolves (and whenever a new plan loads).
  React.useEffect(() => {
    if (!data) return
    const key = `${data.employeeId}:${data.updatedAt ?? "new"}`
    if (loadedKey.current === key) return
    loadedKey.current = key
    setState({
      shortTerm: data.shortTerm,
      midTerm: data.midTerm,
      longTerm: data.longTerm,
      currentCompetencies: data.currentCompetencies,
      developmentNeeds: data.developmentNeeds,
      actionPlan: data.actionPlan,
    })
    setDirty(false)
  }, [data])

  if (data === undefined) {
    return <Skeleton className="h-96 w-full" />
  }
  if (data === null) {
    return (
      <p className="text-muted-foreground text-sm">
        No development plan is available for you yet.
      </p>
    )
  }

  const canEdit = data.canEdit

  function mutate(fn: (draft: PlanState) => PlanState) {
    setState((prev) => fn(prev))
    setDirty(true)
  }

  function addItem(key: ListKey) {
    mutate((s) => ({ ...s, [key]: [...s[key], ""] }))
  }
  function setItem(key: ListKey, i: number, value: string) {
    mutate((s) => ({
      ...s,
      [key]: s[key].map((v, idx) => (idx === i ? value : v)),
    }))
  }
  function removeItem(key: ListKey, i: number) {
    mutate((s) => ({ ...s, [key]: s[key].filter((_, idx) => idx !== i) }))
  }

  function addAction() {
    mutate((s) => ({
      ...s,
      actionPlan: [...s.actionPlan, { label: "", done: false }],
    }))
  }
  function setActionLabel(i: number, label: string) {
    mutate((s) => ({
      ...s,
      actionPlan: s.actionPlan.map((a, idx) =>
        idx === i ? { ...a, label } : a,
      ),
    }))
  }
  function toggleAction(i: number, done: boolean) {
    mutate((s) => ({
      ...s,
      actionPlan: s.actionPlan.map((a, idx) =>
        idx === i ? { ...a, done } : a,
      ),
    }))
  }
  function removeAction(i: number) {
    mutate((s) => ({
      ...s,
      actionPlan: s.actionPlan.filter((_, idx) => idx !== i),
    }))
  }

  async function onSave() {
    setSaving(true)
    try {
      await save({ ...(employeeId ? { employeeId } : {}), ...state })
      setDirty(false)
      toast.success("Development plan saved.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save plan.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          Define your development plans for continuous career growth.
        </p>
        {canEdit && (
          <Button onClick={onSave} disabled={!dirty || saving}>
            <IconDeviceFloppy className="size-4" />
            {saving ? "Saving…" : "Save changes"}
          </Button>
        )}
      </div>

      {/* Term horizons */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <TermCard
          title="Short term"
          subtitle="< 2 years"
          className="bg-teal-50 dark:bg-teal-950/30"
          items={state.shortTerm}
          canEdit={canEdit}
          onAdd={() => addItem("shortTerm")}
          onSet={(i, v) => setItem("shortTerm", i, v)}
          onRemove={(i) => removeItem("shortTerm", i)}
        />
        <TermCard
          title="Mid term"
          subtitle="2–4 years"
          className="bg-amber-50 dark:bg-amber-950/30"
          items={state.midTerm}
          canEdit={canEdit}
          onAdd={() => addItem("midTerm")}
          onSet={(i, v) => setItem("midTerm", i, v)}
          onRemove={(i) => removeItem("midTerm", i)}
        />
        <TermCard
          title="Long term"
          subtitle="> 4 years"
          className="bg-rose-50 dark:bg-rose-950/30"
          items={state.longTerm}
          canEdit={canEdit}
          onAdd={() => addItem("longTerm")}
          onSet={(i, v) => setItem("longTerm", i, v)}
          onRemove={(i) => removeItem("longTerm", i)}
        />
      </div>

      {/* Competencies + action plan */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <ListCard
            title="Current competencies, skills, knowledge, experience"
            hint="List the skillsets you currently have or have gained."
            items={state.currentCompetencies}
            canEdit={canEdit}
            onAdd={() => addItem("currentCompetencies")}
            onSet={(i, v) => setItem("currentCompetencies", i, v)}
            onRemove={(i) => removeItem("currentCompetencies", i)}
          />
          <ListCard
            title="Development needs & skills for current job and future goals"
            hint="List the skillsets you are looking to learn and gain."
            items={state.developmentNeeds}
            canEdit={canEdit}
            onAdd={() => addItem("developmentNeeds")}
            onSet={(i, v) => setItem("developmentNeeds", i, v)}
            onRemove={(i) => removeItem("developmentNeeds", i)}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Action Plan</CardTitle>
            <p className="text-muted-foreground text-sm">
              Define the actions needed to achieve the development plan.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {state.actionPlan.length === 0 && (
              <p className="text-muted-foreground text-sm">No actions yet.</p>
            )}
            {state.actionPlan.map((a, i) => (
              <div key={i} className="flex items-center gap-2">
                <Checkbox
                  checked={a.done}
                  disabled={!canEdit}
                  onCheckedChange={(c) => toggleAction(i, c === true)}
                />
                <Input
                  value={a.label}
                  readOnly={!canEdit}
                  placeholder="Action item"
                  className={cn("h-8", a.done && "line-through opacity-60")}
                  onChange={(e) => setActionLabel(i, e.target.value)}
                />
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    onClick={() => removeAction(i)}
                    aria-label="Remove action"
                  >
                    <IconX className="size-4" />
                  </Button>
                )}
              </div>
            ))}
            {canEdit && (
              <button
                type="button"
                onClick={addAction}
                className="text-primary mt-1 inline-flex items-center gap-1 self-start text-sm hover:underline"
              >
                <IconPlus className="size-4" />
                Add item
              </button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ItemRow({
  value,
  canEdit,
  onSet,
  onRemove,
}: {
  value: string
  canEdit: boolean
  onSet: (v: string) => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Input
        value={value}
        readOnly={!canEdit}
        placeholder="Add detail…"
        className="h-8 bg-background/70"
        onChange={(e) => onSet(e.target.value)}
      />
      {canEdit && (
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={onRemove}
          aria-label="Remove item"
        >
          <IconX className="size-4" />
        </Button>
      )}
    </div>
  )
}

function TermCard({
  title,
  subtitle,
  className,
  items,
  canEdit,
  onAdd,
  onSet,
  onRemove,
}: {
  title: string
  subtitle: string
  className?: string
  items: string[]
  canEdit: boolean
  onAdd: () => void
  onSet: (i: number, v: string) => void
  onRemove: (i: number) => void
}) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-xl border p-4", className)}>
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold">{title}</h3>
        <span className="text-muted-foreground text-xs">{subtitle}</span>
      </div>
      {items.length === 0 && (
        <p className="text-muted-foreground text-sm">No items yet.</p>
      )}
      {items.map((v, i) => (
        <ItemRow
          key={i}
          value={v}
          canEdit={canEdit}
          onSet={(val) => onSet(i, val)}
          onRemove={() => onRemove(i)}
        />
      ))}
      {canEdit && (
        <button
          type="button"
          onClick={onAdd}
          className="text-primary mt-1 inline-flex items-center gap-1 self-start text-sm hover:underline"
        >
          <IconPlus className="size-4" />
          Add item
        </button>
      )}
    </div>
  )
}

function ListCard({
  title,
  hint,
  items,
  canEdit,
  onAdd,
  onSet,
  onRemove,
}: {
  title: string
  hint: string
  items: string[]
  canEdit: boolean
  onAdd: () => void
  onSet: (i: number, v: string) => void
  onRemove: (i: number) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-muted-foreground text-sm">{hint}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {items.length === 0 && (
          <p className="text-muted-foreground text-sm">Nothing added yet.</p>
        )}
        {items.map((v, i) => (
          <ItemRow
            key={i}
            value={v}
            canEdit={canEdit}
            onSet={(val) => onSet(i, val)}
            onRemove={() => onRemove(i)}
          />
        ))}
        {canEdit && (
          <button
            type="button"
            onClick={onAdd}
            className="text-primary mt-1 inline-flex items-center gap-1 self-start text-sm hover:underline"
          >
            <IconPlus className="size-4" />
            Add item
          </button>
        )}
      </CardContent>
    </Card>
  )
}
