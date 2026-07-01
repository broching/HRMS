"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { CYCLE_STATUS_LABELS, CYCLE_STATUS_BADGE } from "@/features/performance/lib/labels"

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00")
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

type PendingPerson = { name: string; photoUrl: string | null }

function PendingAvatars({
  people,
  overflow,
}: {
  people: PendingPerson[]
  overflow: number
}) {
  if (people.length === 0) {
    return <span className="text-muted-foreground text-xs">—</span>
  }
  return (
    <div className="flex items-center">
      {people.map((p, i) => (
        <Avatar
          key={i}
          title={p.name}
          className="ring-background -ml-2 size-7 ring-2 first:ml-0"
        >
          <AvatarImage src={p.photoUrl ?? undefined} alt={p.name} />
          <AvatarFallback className="text-[10px]">
            {initials(p.name)}
          </AvatarFallback>
        </Avatar>
      ))}
      {overflow > 0 && (
        <span className="bg-muted text-muted-foreground ring-background -ml-2 flex size-7 items-center justify-center rounded-full text-[10px] font-medium ring-2">
          +{overflow}
        </span>
      )}
    </div>
  )
}

const STAGE_BADGE: Record<
  "pending" | "ongoing" | "completed",
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  pending: { label: "Pending", variant: "outline" },
  ongoing: { label: "Ongoing", variant: "secondary" },
  completed: { label: "Completed", variant: "default" },
}

export function HrPerformanceDashboard() {
  const router = useRouter()
  const [cycleId, setCycleId] = React.useState<Id<"reviewCycles"> | undefined>(
    undefined,
  )
  const data = useQuery(api.performance.dashboard, cycleId ? { cycleId } : {})

  if (data === undefined) {
    return (
      <div className="flex flex-col gap-4 px-4 lg:px-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (data === null) {
    return (
      <div className="px-4 lg:px-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm font-medium">No review cycles yet</p>
            <p className="text-muted-foreground max-w-sm text-sm">
              Create a review cycle to open the performance dashboard and start
              appraisals.
            </p>
            <Button asChild>
              <Link href="/hr-lounge/performance/cycles">Go to Cycle Overview</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { cycle, cycles, stages, employees, totals } = data

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      {/* Timeline */}
      <div>
        <div className="relative mb-2 h-1.5 rounded-full bg-gradient-to-r from-rose-200 via-orange-300 to-orange-500" />
        <div className="text-muted-foreground flex justify-between text-xs">
          <span>{formatDate(cycle.startDate)}</span>
          <span>{formatDate(cycle.endDate)}</span>
        </div>
      </div>

      {/* Header row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold">Current cycle — {cycle.name}</h2>
          <Badge variant={CYCLE_STATUS_BADGE[cycle.status]}>
            {CYCLE_STATUS_LABELS[cycle.status].toUpperCase()}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={cycle._id}
            onValueChange={(v) => setCycleId(v as Id<"reviewCycles">)}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Cycle" />
            </SelectTrigger>
            <SelectContent>
              {cycles.map((c) => (
                <SelectItem key={c._id} value={c._id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button asChild>
            <Link href={`/hr-lounge/performance/report?cycleId=${cycle._id}`}>
              View Report
            </Link>
          </Button>
        </div>
      </div>

      {/* Employee report selector */}
      <Select
        onValueChange={(reviewId) =>
          router.push(`/hr-lounge/performance/appraisals/${reviewId}`)
        }
      >
        <SelectTrigger className="w-full max-w-xl">
          <SelectValue placeholder="Select employee to open their report" />
        </SelectTrigger>
        <SelectContent>
          {employees.map((e) => (
            <SelectItem key={e.reviewId} value={e.reviewId}>
              {e.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Progress overview */}
      <Card>
        <CardContent className="pt-6">
          <h3 className="mb-4 text-lg font-semibold">Progress Overview</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs uppercase">
                  <th className="pb-3 font-medium">Stage</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Due date</th>
                  <th className="pb-3 font-medium">Completion</th>
                  <th className="pb-3 font-medium">Pending completion</th>
                </tr>
              </thead>
              <tbody>
                {stages.map((s) => {
                  const badge = STAGE_BADGE[s.status]
                  return (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="py-3 pr-4">{s.label}</td>
                      <td className="py-3 pr-4">
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </td>
                      <td className="text-muted-foreground py-3 pr-4">
                        {s.dueDate ? formatDate(s.dueDate) : "—"}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <div className="bg-muted h-2 w-32 overflow-hidden rounded-full">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                s.status === "completed"
                                  ? "bg-emerald-500"
                                  : "bg-emerald-400",
                              )}
                              style={{ width: `${s.completionPct}%` }}
                            />
                          </div>
                          <span className="text-muted-foreground w-16 text-xs">
                            {s.done}/{s.total}
                          </span>
                        </div>
                      </td>
                      <td className="py-3">
                        <PendingAvatars
                          people={s.pending}
                          overflow={s.pendingOverflow}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-muted-foreground mt-4 text-xs">
            {totals.completed} of {totals.reviews} appraisals completed.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
