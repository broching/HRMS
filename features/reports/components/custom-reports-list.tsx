"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import {
  IconPlus,
  IconChartHistogram,
  IconDots,
  IconTrash,
  IconTable,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { sourceByKey } from "@/features/reports/lib/custom-report"

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.round(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(ts).toLocaleDateString()
}

export function CustomReportsList() {
  const reports = useQuery(api.customReports.list, {})
  const router = useRouter()
  const removeReport = useMutation(api.customReports.remove)

  async function handleDelete(id: Id<"customReports">, name: string) {
    try {
      await removeReport({ id })
      toast.success(`Deleted “${name}”`)
    } catch {
      toast.error("Could not delete the report")
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Custom reports</h2>
          <p className="text-muted-foreground text-sm">
            Build dashboards with your own charts, drawn from any dataset.
          </p>
        </div>
        <Button onClick={() => router.push("/hr-lounge/reports/custom/new")}>
          <IconPlus className="size-4" />
          New report
        </Button>
      </div>

      {reports === undefined ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reports.map((r) => {
            const source = sourceByKey(r.dataset)
            return (
              <Card
                key={r._id}
                className="group hover:border-primary/40 relative transition-colors"
              >
                <CardContent className="flex flex-col gap-3 p-5">
                  <div className="flex items-start gap-3">
                    <div className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
                      <IconChartHistogram className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/hr-lounge/reports/custom/${r._id}`}
                        className="block truncate font-semibold hover:underline"
                      >
                        {r.name}
                      </Link>
                      <p className="text-muted-foreground truncate text-sm">
                        {r.description || source?.label || "Custom dashboard"}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 shrink-0"
                          aria-label="Report actions"
                        >
                          <IconDots className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => handleDelete(r._id, r.name)}
                        >
                          <IconTrash className="size-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="text-muted-foreground flex items-center gap-3 text-xs">
                    <span className="inline-flex items-center gap-1">
                      <IconTable className="size-3.5" />
                      {r.chartCount} chart{r.chartCount === 1 ? "" : "s"}
                    </span>
                    <span>·</span>
                    <span>Edited {timeAgo(r.updatedAt)}</span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function EmptyState() {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => router.push("/hr-lounge/reports/custom/new")}
      className="border-muted-foreground/25 text-muted-foreground hover:border-primary hover:text-foreground flex min-h-56 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors"
    >
      <IconChartHistogram className="size-8" />
      <div>
        <p className="text-foreground font-medium">No custom reports yet</p>
        <p className="text-sm">
          Create a dashboard and drop in charts to visualise any dataset.
        </p>
      </div>
      <span className="text-primary inline-flex items-center gap-1 text-sm font-medium">
        <IconPlus className="size-4" />
        New report
      </span>
    </button>
  )
}
