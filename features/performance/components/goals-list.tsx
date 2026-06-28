"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import { IconPlus, IconTrash } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  GOAL_STATUS_BADGE,
  GOAL_STATUS_LABELS,
} from "@/features/performance/lib/labels"

function AddGoalDialog({ employeeId }: { employeeId?: Id<"employees"> }) {
  const create = useMutation(api.goals.create)
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [weight, setWeight] = React.useState("")
  const [dueDate, setDueDate] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function submit() {
    if (!title.trim()) {
      toast.error("Give the goal a title.")
      return
    }
    setBusy(true)
    try {
      await create({
        employeeId,
        title,
        description: description || undefined,
        weight: weight ? Number(weight) : undefined,
        dueDate: dueDate || undefined,
      })
      toast.success("Goal added")
      setOpen(false)
      setTitle("")
      setDescription("")
      setWeight("")
      setDueDate("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add goal")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <IconPlus className="size-4" />
          Add goal
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add goal</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="g-title">Title</Label>
            <Input
              id="g-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ship the onboarding revamp"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="g-desc">Description</Label>
            <Textarea
              id="g-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="g-weight">Weight (%)</Label>
              <Input
                id="g-weight"
                inputMode="numeric"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="20"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="g-due">Due date</Label>
              <Input
                id="g-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            Add goal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function GoalsList({
  employeeId,
  title = "Goals",
}: {
  employeeId?: Id<"employees">
  title?: string
}) {
  const goals = useQuery(
    api.goals.forEmployee,
    employeeId ? { employeeId } : "skip",
  )
  const mineGoals = useQuery(api.goals.mine, employeeId ? "skip" : {})
  const update = useMutation(api.goals.update)
  const remove = useMutation(api.goals.remove)

  const data = employeeId ? goals : mineGoals

  async function setProgress(goalId: Id<"goals">, progress: number) {
    try {
      await update({ goalId, progress })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update")
    }
  }

  return (
    <Card className="mx-4 lg:mx-6">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <AddGoalDialog employeeId={employeeId} />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {data === undefined ? (
          <Skeleton className="h-24 w-full" />
        ) : data.length === 0 ? (
          <p className="text-muted-foreground text-sm">No goals yet.</p>
        ) : (
          data.map((g) => (
            <div key={g._id} className="flex flex-col gap-2 rounded-md border p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{g.title}</div>
                  {g.description && (
                    <p className="text-muted-foreground text-sm">
                      {g.description}
                    </p>
                  )}
                  <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                    {g.weight > 0 && <span>Weight {g.weight}%</span>}
                    {g.dueDate && <span>Due {g.dueDate}</span>}
                    {g.cycleName && <span>· {g.cycleName}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={GOAL_STATUS_BADGE[g.status]}>
                    {GOAL_STATUS_LABELS[g.status]}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={async () => {
                      try {
                        await remove({ goalId: g._id })
                      } catch (e) {
                        toast.error(
                          e instanceof Error ? e.message : "Couldn't remove",
                        )
                      }
                    }}
                    aria-label="Remove goal"
                  >
                    <IconTrash className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full"
                    style={{ width: `${g.progress}%` }}
                  />
                </div>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={g.progress}
                  onBlur={(e) => {
                    const n = Number(e.target.value)
                    if (!Number.isNaN(n) && n !== g.progress) setProgress(g._id, n)
                  }}
                  className="w-20"
                />
                <span className="text-muted-foreground text-sm">%</span>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
