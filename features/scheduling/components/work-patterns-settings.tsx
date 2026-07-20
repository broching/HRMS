"use client"

import { getErrorMessage } from "@/lib/errors"
import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import { IconTrash, IconPlus, IconStar, IconStarFilled } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { SHIFT_COLORS } from "@/features/scheduling/lib/labels"

const DOW = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

type DayState = { off: boolean; startTime: string; endTime: string; breakMinutes: string }

function defaultDays(): DayState[] {
  return DOW.map((_, i) => ({
    off: i >= 5,
    startTime: "09:00",
    endTime: "18:00",
    breakMinutes: "60",
  }))
}

type PatternDoc = {
  _id: Id<"workPatterns">
  name: string
  color: string | null
  isDefault: boolean
  days: {
    off: boolean
    startTime: string | null
    endTime: string | null
    breakMinutes: number | null
  }[]
}

function WeekDaysEditor({
  days,
  onChange,
}: {
  days: DayState[]
  onChange: (days: DayState[]) => void
}) {
  function patch(i: number, next: Partial<DayState>) {
    onChange(days.map((d, idx) => (idx === i ? { ...d, ...next } : d)))
  }
  return (
    <div className="flex flex-col gap-2">
      {days.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-24 text-sm">{DOW[i]}</div>
          <Switch
            checked={!d.off}
            onCheckedChange={(on) => patch(i, { off: !on })}
            aria-label={`${DOW[i]} working`}
          />
          {d.off ? (
            <span className="text-muted-foreground text-sm">Off</span>
          ) : (
            <div className="flex flex-1 items-center gap-2">
              <Input
                type="time"
                value={d.startTime}
                onChange={(e) => patch(i, { startTime: e.target.value })}
                className="w-28"
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="time"
                value={d.endTime}
                onChange={(e) => patch(i, { endTime: e.target.value })}
                className="w-28"
              />
              <Input
                inputMode="numeric"
                value={d.breakMinutes}
                onChange={(e) => patch(i, { breakMinutes: e.target.value })}
                className="w-16"
                aria-label="Break minutes"
                title="Break (minutes)"
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function PatternDialog({
  existing,
  trigger,
}: {
  existing?: PatternDoc
  trigger: React.ReactNode
}) {
  const create = useMutation(api.workPatterns.create)
  const update = useMutation(api.workPatterns.update)
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [color, setColor] = React.useState(SHIFT_COLORS[0])
  const [isDefault, setIsDefault] = React.useState(false)
  const [days, setDays] = React.useState<DayState[]>(defaultDays)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    if (existing) {
      setName(existing.name)
      setColor(existing.color ?? SHIFT_COLORS[0])
      setIsDefault(existing.isDefault)
      setDays(
        existing.days.map((d) => ({
          off: d.off,
          startTime: d.startTime ?? "09:00",
          endTime: d.endTime ?? "18:00",
          breakMinutes: String(d.breakMinutes ?? 60),
        })),
      )
    } else {
      setName("")
      setColor(SHIFT_COLORS[0])
      setIsDefault(false)
      setDays(defaultDays())
    }
  }, [open, existing])

  async function submit() {
    if (!name.trim()) {
      toast.error("Give the pattern a name.")
      return
    }
    const payloadDays = days.map((d) => ({
      off: d.off,
      startTime: d.off ? undefined : d.startTime,
      endTime: d.off ? undefined : d.endTime,
      breakMinutes: d.off ? undefined : Number(d.breakMinutes) || 0,
    }))
    setBusy(true)
    try {
      if (existing) {
        await update({ id: existing._id, name: name.trim(), days: payloadDays, color, isDefault })
        toast.success("Pattern updated")
      } else {
        await create({ name: name.trim(), days: payloadDays, color, isDefault })
        toast.success("Pattern added")
      }
      setOpen(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit work pattern" : "New work pattern"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wp-name">Name</Label>
            <Input
              id="wp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Office Mon–Fri 9–6"
            />
          </div>
          <WeekDaysEditor days={days} onChange={setDays} />
          <div className="flex flex-col gap-1.5">
            <Label>Colour</Label>
            <div className="flex flex-wrap gap-2">
              {SHIFT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "size-6 rounded-full border-2",
                    color === c ? "border-foreground" : "border-transparent",
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`Colour ${c}`}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={isDefault} onCheckedChange={setIsDefault} id="wp-default" />
            <Label htmlFor="wp-default" className="font-normal">
              Org default (auto-fills salaried staff without their own pattern)
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {existing ? "Save" : "Add pattern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function summarise(p: PatternDoc): string {
  const working = p.days.filter((d) => !d.off)
  if (working.length === 0) return "No working days"
  const first = working[0]
  const sameTimes = working.every(
    (d) => d.startTime === first.startTime && d.endTime === first.endTime,
  )
  const dayNames = p.days
    .map((d, i) => (d.off ? null : DOW[i].slice(0, 3)))
    .filter(Boolean)
    .join(", ")
  return sameTimes
    ? `${dayNames} · ${first.startTime}–${first.endTime}`
    : `${dayNames} · varies`
}

function AssignmentTable({ patterns }: { patterns: PatternDoc[] }) {
  const rows = useQuery(api.workPatterns.assignments)
  const assign = useMutation(api.workPatterns.assignToEmployee)
  const [search, setSearch] = React.useState("")

  const filtered = (rows ?? []).filter((r) =>
    r.name.toLowerCase().includes(search.trim().toLowerCase()),
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assign patterns to people</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Input
          placeholder="Search people"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        {rows === undefined ? (
          <Skeleton className="h-24 w-full" />
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground text-sm">No people.</p>
        ) : (
          <div className="flex flex-col divide-y">
            {filtered.map((r) => (
              <div key={r.employeeId} className="flex items-center gap-3 py-2">
                <div className="flex-1">
                  <div className="text-sm font-medium">{r.name}</div>
                  {r.jobTitle && (
                    <div className="text-muted-foreground text-xs">{r.jobTitle}</div>
                  )}
                </div>
                <Select
                  value={r.workPatternId ?? "none"}
                  onValueChange={async (val) => {
                    try {
                      await assign({
                        employeeId: r.employeeId,
                        patternId: val === "none" ? null : (val as Id<"workPatterns">),
                      })
                      toast.success("Updated")
                    } catch (e) {
                      toast.error(getErrorMessage(e, "Couldn't update"))
                    }
                  }}
                >
                  <SelectTrigger className="w-52">
                    <SelectValue placeholder="Default / none" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Default / none</SelectItem>
                    {patterns.map((p) => (
                      <SelectItem key={p._id} value={p._id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function WorkPatternsSettings() {
  const patterns = useQuery(api.workPatterns.list) as PatternDoc[] | undefined
  const setDefault = useMutation(api.workPatterns.setDefault)
  const remove = useMutation(api.workPatterns.remove)
  const ensureDefault = useMutation(api.workPatterns.ensureDefault)

  // Every org should always have a default work pattern (standard 9–5 Mon–Fri).
  // Seed it for orgs that don't yet have one; harmless/idempotent otherwise.
  React.useEffect(() => {
    void ensureDefault({}).catch(() => {})
  }, [ensureDefault])

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <Card>
        <CardHeader className="flex-col items-start gap-1 space-y-0">
          <div className="flex w-full items-center justify-between">
            <CardTitle>Work patterns</CardTitle>
            <PatternDialog
              trigger={
                <Button size="sm">
                  <IconPlus className="size-4" />
                  New pattern
                </Button>
              }
            />
          </div>
          <p className="text-muted-foreground text-sm font-normal">
            The org default (starred) auto-fills the roster for salaried staff
            who don&rsquo;t have their own pattern. Edit it to match your
            standard hours, or add patterns for teams that work differently.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {patterns === undefined ? (
            <Skeleton className="h-16 w-full" />
          ) : patterns.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No patterns yet. Create one so salaried staff auto-fill the roster.
            </p>
          ) : (
            patterns.map((p) => (
              <div key={p._id} className="flex items-center gap-3 rounded-md border p-3">
                <span
                  className="size-3.5 rounded-full"
                  style={{ backgroundColor: p.color ?? "#6366f1" }}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 font-medium">
                    {p.name}
                    {p.isDefault && <Badge variant="secondary">Default</Badge>}
                  </div>
                  <div className="text-muted-foreground text-sm">{summarise(p)}</div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  title={p.isDefault ? "Default pattern" : "Set as default"}
                  onClick={async () => {
                    if (p.isDefault) return
                    try {
                      await setDefault({ id: p._id })
                      toast.success("Default updated")
                    } catch (e) {
                      toast.error(getErrorMessage(e, "Couldn't update"))
                    }
                  }}
                >
                  {p.isDefault ? (
                    <IconStarFilled className="size-4 text-amber-500" />
                  ) : (
                    <IconStar className="size-4" />
                  )}
                </Button>
                <PatternDialog
                  existing={p}
                  trigger={
                    <Button variant="outline" size="sm">
                      Edit
                    </Button>
                  }
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={async () => {
                    try {
                      await remove({ id: p._id })
                      toast.success("Pattern removed")
                    } catch (e) {
                      toast.error(getErrorMessage(e, "Couldn't remove"))
                    }
                  }}
                  aria-label="Delete pattern"
                >
                  <IconTrash className="size-4" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <AssignmentTable patterns={patterns ?? []} />
    </div>
  )
}
