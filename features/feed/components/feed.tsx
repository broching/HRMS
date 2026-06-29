"use client"

import * as React from "react"
import { useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import {
  IconChevronLeft,
  IconChevronRight,
  IconPinned,
  IconSearch,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import { useCurrentMember } from "@/hooks/use-current-member"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { PostCard } from "./post-card"
import { CreatePostDialog } from "./create-post-dialog"

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

function iso(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

export function Feed() {
  const posts = useQuery(api.feed.list)
  const member = useCurrentMember()
  const isAdminHr = member?.role === "admin" || member?.role === "hr"

  const [createOpen, setCreateOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")

  const pinned = (posts ?? []).filter((p) => p.pinned)

  const filtered = (posts ?? []).filter((p) => {
    if (!search.trim()) return true
    const q = search.trim().toLowerCase()
    const text = p.body.replace(/<[^>]*>/g, " ")
    return `${p.title} ${text} ${p.authorName}`.toLowerCase().includes(q)
  })

  return (
    <div className="grid gap-6 px-4 lg:grid-cols-[260px_1fr_300px] lg:px-6">
      {/* Left — pinned posts */}
      <aside className="order-2 flex flex-col gap-3 lg:order-1">
        <h2 className="text-sm font-semibold">Pinned Post</h2>
        {pinned.length === 0 ? (
          <p className="text-muted-foreground text-sm">No pinned posts.</p>
        ) : (
          pinned.map((p) => (
            <Card key={p._id} className="border-l-primary border-l-4 p-3">
              <div className="flex items-center gap-1.5">
                <IconPinned className="text-primary size-4" />
                <span className="text-sm font-medium">{p.title}</span>
              </div>
              {p.body && (
                <p className="text-muted-foreground mt-1 line-clamp-3 text-xs">
                  {p.body.replace(/<[^>]*>/g, " ")}
                </p>
              )}
            </Card>
          ))
        )}
      </aside>

      {/* Center — composer + search + list */}
      <div className="order-1 flex flex-col gap-4 lg:order-2">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="bg-muted/40 hover:bg-muted/70 flex items-center gap-3 rounded-full border px-4 py-3 text-left transition-colors"
        >
          <Avatar className="size-8">
            <AvatarFallback className="text-xs">
              {(member?.userName ?? "?").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="text-muted-foreground text-sm">
            Hi {member?.userName ?? "there"}, what would you like to share?
          </span>
        </button>

        <div className="relative">
          <IconSearch className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search posts"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {posts === undefined ? (
          <Skeleton className="h-40 w-full" />
        ) : filtered.length === 0 ? (
          <div className="text-muted-foreground rounded-lg border border-dashed py-16 text-center text-sm">
            {search ? "No posts match your search." : "No posts yet."}
          </div>
        ) : (
          filtered.map((p) => <PostCard key={p._id} post={p} />)
        )}
      </div>

      {/* Right — event calendar */}
      <aside className="order-3">
        <EventCalendar posts={posts ?? []} />
      </aside>

      <CreatePostDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        isAdminHr={isAdminHr}
      />
    </div>
  )
}

type Post = FunctionReturnType<typeof api.feed.list>[number]

function EventCalendar({ posts }: { posts: Post[] }) {
  const today = new Date()
  const [year, setYear] = React.useState(today.getFullYear())
  const [month, setMonth] = React.useState(today.getMonth())
  const [selectedDay, setSelectedDay] = React.useState<string | null>(null)

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstWeekday = new Date(year, month, 1).getDay()

  const events = posts.filter((p) => p.isEvent && p.eventDate)
  const eventDays = React.useMemo(() => {
    const set = new Set<number>()
    for (const e of events) {
      if (!e.eventDate) continue
      if (e.eventDate.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`)) {
        set.add(Number(e.eventDate.slice(8, 10)))
      }
    }
    return set
  }, [events, year, month])

  function shift(delta: number) {
    const next = new Date(year, month + delta, 1)
    setYear(next.getFullYear())
    setMonth(next.getMonth())
    setSelectedDay(null)
  }

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const dayEvents = selectedDay
    ? events.filter((e) => e.eventDate === selectedDay)
    : []

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Event Calendar</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => shift(-1)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Previous month"
          >
            <IconChevronLeft className="size-4" />
          </button>
          <span className="text-sm font-medium">
            {MONTHS[month]} {year}
          </span>
          <button
            onClick={() => shift(1)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Next month"
          >
            <IconChevronRight className="size-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((w) => (
            <span key={w} className="text-muted-foreground py-1 text-xs">
              {w}
            </span>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <span key={`e${i}`} />
            const dayIso = iso(year, month, d)
            const hasEvent = eventDays.has(d)
            const isToday =
              year === today.getFullYear() &&
              month === today.getMonth() &&
              d === today.getDate()
            return (
              <button
                key={d}
                onClick={() => setSelectedDay(hasEvent ? dayIso : null)}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-md text-sm",
                  hasEvent && "bg-primary text-primary-foreground font-medium",
                  isToday && !hasEvent && "ring-primary ring-1",
                )}
              >
                {d}
              </button>
            )
          })}
        </div>

        <div className="border-t pt-3">
          {dayEvents.length > 0 ? (
            <div className="flex flex-col gap-2">
              {dayEvents.map((e) => (
                <div key={e._id} className="flex flex-col">
                  <span className="text-sm font-medium">{e.title}</span>
                  {e.eventLocation && (
                    <span className="text-muted-foreground text-xs">
                      {e.eventLocation}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center text-xs">
              No event to display. Click a highlighted date to see its event.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
