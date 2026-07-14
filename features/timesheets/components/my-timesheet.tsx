"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import {
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconClockPlus,
  IconCalendarClock,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"
import {
  todayIso,
  mondayOfIso,
  addDaysIso,
  addMonthsIso,
  weekDates,
  monthRange,
  monthGrid,
  sameMonth,
  formatMinutes,
  formatHoursDecimal,
  formatDayLabel,
  weekRangeLabel,
  monthLabel,
  dowLabel,
  dayOfMonth,
} from "@/features/timesheets/lib/time"
import { TimeGrid } from "@/features/timesheets/components/time-grid"
import { EntryDialog, type EntryDraft } from "@/features/timesheets/components/entry-dialog"

type Entry = FunctionReturnType<typeof api.timeEntries.mine>[number]
type View = "day" | "week" | "month"

export function MyTimesheet() {
  const [view, setView] = React.useState<View>("day")
  const [anchor, setAnchor] = React.useState<string>(() => todayIso())
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [draft, setDraft] = React.useState<EntryDraft>({})

  // Date range for the current view.
  const range = React.useMemo(() => {
    if (view === "day") return { from: anchor, to: anchor }
    if (view === "week") {
      const monday = mondayOfIso(anchor)
      return { from: monday, to: addDaysIso(monday, 6) }
    }
    return monthRange(anchor)
  }, [view, anchor])

  const entries = useQuery(api.timeEntries.mine, range)
  const projectsAll = useQuery(api.projects.list) ?? []
  const projects = projectsAll.filter((p) => p.status === "active")

  const byDate = React.useMemo(() => {
    const m = new Map<string, Entry[]>()
    for (const e of entries ?? []) {
      const arr = m.get(e.date) ?? []
      arr.push(e)
      m.set(e.date, arr)
    }
    return m
  }, [entries])

  const rangeMinutes = (entries ?? []).reduce((s, e) => s + e.minutes, 0)

  // ── Openers ────────────────────────────────────────────────────────────────
  function openNew(partial?: EntryDraft) {
    setDraft({ date: anchor, ...partial })
    setDialogOpen(true)
  }
  function openEdit(entry: Entry) {
    setDraft({ entry })
    setDialogOpen(true)
  }
  function openSlot(date: string, minute: number, minutes?: number) {
    setDraft({ date, startMinute: minute, minutes: minutes ?? 60 })
    setDialogOpen(true)
  }

  // ── Navigation ───────────────────────────────────────────────────────────────
  function step(dir: -1 | 1) {
    if (view === "day") setAnchor(addDaysIso(anchor, dir))
    else if (view === "week") setAnchor(addDaysIso(anchor, dir * 7))
    else setAnchor(addMonthsIso(anchor, dir))
  }
  function goToday() {
    setAnchor(todayIso())
  }
  const rangeLabel =
    view === "day"
      ? formatDayLabel(anchor)
      : view === "week"
        ? weekRangeLabel(mondayOfIso(anchor))
        : monthLabel(anchor)

  const dates = view === "week" ? weekDates(mondayOfIso(anchor)) : [anchor]

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border">
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-r-none"
              onClick={() => step(-1)}
              aria-label="Previous"
            >
              <IconChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 rounded-l-none border-l"
              onClick={() => step(1)}
              aria-label="Next"
            >
              <IconChevronRight className="size-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <div className="ml-1">
            <div className="text-sm font-semibold">{rangeLabel}</div>
            <div className="text-muted-foreground text-xs tabular-nums">
              {formatMinutes(rangeMinutes)} logged
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => v && setView(v as View)}
            variant="outline"
            size="sm"
          >
            <ToggleGroupItem value="day" className="px-3">
              Day
            </ToggleGroupItem>
            <ToggleGroupItem value="week" className="px-3">
              Week
            </ToggleGroupItem>
            <ToggleGroupItem value="month" className="px-3">
              Month
            </ToggleGroupItem>
          </ToggleGroup>
          <Button onClick={() => openNew()}>
            <IconPlus className="size-4" />
            Log time
          </Button>
        </div>
      </div>

      {/* Quick-log cards */}
      <QuickLog
        entries={entries}
        projects={projects}
        onQuick={(d) => openNew(d)}
      />

      {/* View body */}
      {entries === undefined ? (
        <Skeleton className="h-96 w-full" />
      ) : view === "month" ? (
        <MonthView
          anchor={anchor}
          byDate={byDate}
          onPickDay={(date) => {
            setAnchor(date)
            setView("day")
          }}
          onAdd={(date) => openNew({ date })}
        />
      ) : (
        <Card className="gap-0 overflow-hidden p-0">
          <UnscheduledStrip
            dates={dates}
            byDate={byDate}
            showDayLabel={view === "week"}
            onSelect={openEdit}
            onAdd={(date) => openNew({ date })}
          />
          <TimeGrid
            dates={dates}
            entriesByDate={byDate}
            onCreate={openSlot}
            onSelect={openEdit}
            compactColumns={view === "week"}
          />
        </Card>
      )}

      <EntryDialog
        open={dialogOpen}
        draft={draft}
        projects={projects}
        onOpenChange={setDialogOpen}
      />
    </div>
  )
}

// ── Quick-log cards ────────────────────────────────────────────────────────────
// One-tap "log again" chips built from recent project/task combos, plus a
// prominent add card. Falls back to active projects when nothing's logged yet.

function QuickLog({
  entries,
  projects,
  onQuick,
}: {
  entries: Entry[] | undefined
  projects: FunctionReturnType<typeof api.projects.list>
  onQuick: (draft: EntryDraft) => void
}) {
  const combos = React.useMemo(() => {
    const seen = new Set<string>()
    const out: {
      key: string
      label: string
      sub?: string
      color?: string | null
      draft: EntryDraft
    }[] = []
    // Most-recent first.
    const sorted = [...(entries ?? [])].sort(
      (a, b) => b._creationTime - a._creationTime,
    )
    for (const e of sorted) {
      const key = `${e.projectId}:${e.taskId ?? ""}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        key,
        label: e.projectName,
        sub: e.taskName ?? undefined,
        color: e.projectColor,
        draft: {
          date: todayIso(),
          projectId: e.projectId,
          taskId: e.taskId ?? undefined,
        },
      })
      if (out.length >= 4) break
    }
    // Pad with active projects the user hasn't logged recently.
    for (const p of projects) {
      if (out.length >= 4) break
      const key = `${p._id}:`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        key,
        label: p.name,
        color: p.color,
        draft: { date: todayIso(), projectId: p._id },
      })
    }
    return out
  }, [entries, projects])

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      <button
        type="button"
        onClick={() => onQuick({ date: todayIso() })}
        className="border-primary/40 bg-primary/5 hover:bg-primary/10 flex items-center gap-2 rounded-xl border border-dashed p-3 text-left transition-colors"
      >
        <span className="bg-primary/15 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
          <IconClockPlus className="size-4" />
        </span>
        <span className="text-sm font-medium">Log time</span>
      </button>
      {combos.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => onQuick(c.draft)}
          className="hover:border-primary/40 hover:bg-accent/40 flex items-center gap-2 rounded-xl border p-3 text-left transition-colors"
        >
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: c.color ?? "#94a3b8" }}
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{c.label}</span>
            {c.sub && (
              <span className="text-muted-foreground block truncate text-xs">
                {c.sub}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  )
}

// ── Unscheduled entries strip ──────────────────────────────────────────────────
// Entries without a start time, shown above the grid so nothing is hidden.

function UnscheduledStrip({
  dates,
  byDate,
  showDayLabel,
  onSelect,
  onAdd,
}: {
  dates: string[]
  byDate: Map<string, Entry[]>
  showDayLabel: boolean
  onSelect: (e: Entry) => void
  onAdd: (date: string) => void
}) {
  const items: { date: string; entry: Entry }[] = []
  for (const d of dates) {
    for (const e of byDate.get(d) ?? []) {
      if (e.startMinute == null) items.push({ date: d, entry: e })
    }
  }
  if (items.length === 0) return null
  return (
    <div className="bg-muted/30 border-b px-3 py-2">
      <div className="text-muted-foreground mb-1.5 flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase">
        <IconCalendarClock className="size-3.5" />
        Unscheduled
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map(({ date, entry }) => (
          <button
            key={entry._id}
            type="button"
            onClick={() => onSelect(entry)}
            className="bg-card hover:border-primary/40 flex items-center gap-1.5 rounded-md border px-2 py-1 text-left text-xs transition-colors"
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.projectColor ?? "#94a3b8" }}
            />
            <span className="max-w-[10rem] truncate font-medium">
              {entry.projectName}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {formatMinutes(entry.minutes)}
            </span>
            {showDayLabel && (
              <span className="text-muted-foreground">· {dowLabel(date)}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Month view ─────────────────────────────────────────────────────────────────

function MonthView({
  anchor,
  byDate,
  onPickDay,
  onAdd,
}: {
  anchor: string
  byDate: Map<string, Entry[]>
  onPickDay: (date: string) => void
  onAdd: (date: string) => void
}) {
  const weeks = monthGrid(anchor)
  const today = todayIso()
  return (
    <Card className="overflow-hidden p-0">
      <div className="text-muted-foreground grid grid-cols-7 border-b text-center text-[11px] font-medium tracking-wide uppercase">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
            {week.map((date) => {
              const dayEntries = byDate.get(date) ?? []
              const minutes = dayEntries.reduce((s, e) => s + e.minutes, 0)
              const inMonth = sameMonth(date, anchor)
              const isToday = date === today
              // Distinct project colours for the day's dots (max 4).
              const colors = [
                ...new Set(dayEntries.map((e) => e.projectColor ?? "#94a3b8")),
              ].slice(0, 4)
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => onPickDay(date)}
                  className={cn(
                    "group hover:bg-accent/40 relative flex min-h-[84px] flex-col gap-1 border-r p-1.5 text-left transition-colors last:border-r-0",
                    !inMonth && "bg-muted/20 text-muted-foreground",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                        isToday && "bg-primary text-primary-foreground font-semibold",
                      )}
                    >
                      {dayOfMonth(date)}
                    </span>
                    {minutes > 0 && (
                      <span className="text-[11px] font-medium tabular-nums">
                        {formatHoursDecimal(minutes)}
                      </span>
                    )}
                  </div>
                  {colors.length > 0 && (
                    <div className="mt-auto flex flex-wrap gap-1">
                      {colors.map((c, i) => (
                        <span
                          key={i}
                          className="size-1.5 rounded-full"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </Card>
  )
}
