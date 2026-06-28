"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import { IconTrash } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  CYCLE_STATUS_BADGE,
  CYCLE_STATUS_LABELS,
} from "@/features/performance/lib/labels"

function CreateCycle() {
  const create = useMutation(api.reviewCycles.create)
  const [name, setName] = React.useState("")
  const [start, setStart] = React.useState("")
  const [end, setEnd] = React.useState("")
  const [scale, setScale] = React.useState("5")
  const [busy, setBusy] = React.useState(false)

  async function submit() {
    if (!name.trim() || !start || !end) {
      toast.error("Name, start and end dates are required.")
      return
    }
    setBusy(true)
    try {
      await create({
        name,
        startDate: start,
        endDate: end,
        ratingScaleMax: Number(scale) || 5,
      })
      toast.success("Cycle created")
      setName("")
      setStart("")
      setEnd("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New review cycle</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rc-name">Name</Label>
            <Input
              id="rc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="H1 2026"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rc-scale">Rating scale max</Label>
            <Input
              id="rc-scale"
              inputMode="numeric"
              value={scale}
              onChange={(e) => setScale(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rc-start">Start</Label>
            <Input
              id="rc-start"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rc-end">End</Label>
            <Input
              id="rc-end"
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Button onClick={submit} disabled={busy}>
            Create cycle
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function ReviewCyclesSettings() {
  const cycles = useQuery(api.reviewCycles.list)
  const activate = useMutation(api.reviewCycles.activate)
  const close = useMutation(api.reviewCycles.close)
  const remove = useMutation(api.reviewCycles.remove)

  async function run(p: Promise<unknown>, ok: string) {
    try {
      await p
      toast.success(ok)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed")
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <CreateCycle />

      <Card>
        <CardHeader>
          <CardTitle>Cycles</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {cycles === undefined ? (
            <Skeleton className="h-16 w-full" />
          ) : cycles.length === 0 ? (
            <p className="text-muted-foreground text-sm">No cycles yet.</p>
          ) : (
            cycles.map((c) => (
              <div
                key={c._id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    <Badge variant={CYCLE_STATUS_BADGE[c.status]}>
                      {CYCLE_STATUS_LABELS[c.status]}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {c.startDate} → {c.endDate} · scale 1–{c.ratingScaleMax}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {c.status === "draft" && (
                    <Button
                      size="sm"
                      onClick={() =>
                        run(
                          activate({ cycleId: c._id as Id<"reviewCycles"> }).then(
                            (r) =>
                              toast.message(`${r.created} reviews generated`),
                          ),
                          "Cycle activated",
                        )
                      }
                    >
                      Activate
                    </Button>
                  )}
                  {c.status === "active" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          run(
                            activate({ cycleId: c._id as Id<"reviewCycles"> }),
                            "Reviews synced",
                          )
                        }
                      >
                        Sync employees
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          run(
                            close({ cycleId: c._id as Id<"reviewCycles"> }),
                            "Cycle closed",
                          )
                        }
                      >
                        Close
                      </Button>
                    </>
                  )}
                  {c.status === "draft" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        run(
                          remove({ cycleId: c._id as Id<"reviewCycles"> }),
                          "Cycle deleted",
                        )
                      }
                      aria-label="Delete cycle"
                    >
                      <IconTrash className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
