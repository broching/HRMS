"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import { IconTrash } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  SHIFT_COLORS,
  formatMinutes,
} from "@/features/scheduling/lib/labels"
import { shiftDurationMinutes } from "@/convex/model/shiftTime"

function AddTemplate() {
  const create = useMutation(api.shiftTemplates.create)
  const [name, setName] = React.useState("")
  const [startTime, setStartTime] = React.useState("09:00")
  const [endTime, setEndTime] = React.useState("17:00")
  const [breakMinutes, setBreakMinutes] = React.useState("60")
  const [color, setColor] = React.useState(SHIFT_COLORS[0])
  const [busy, setBusy] = React.useState(false)

  async function submit() {
    if (!name.trim()) {
      toast.error("Give the template a name.")
      return
    }
    setBusy(true)
    try {
      await create({
        name: name.trim(),
        startTime,
        endTime,
        breakMinutes: Number(breakMinutes) || 0,
        color,
      })
      toast.success("Template added")
      setName("")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add shift template</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-name">Name</Label>
            <Input
              id="t-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Morning"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-break">Break (minutes)</Label>
            <Input
              id="t-break"
              inputMode="numeric"
              value={breakMinutes}
              onChange={(e) => setBreakMinutes(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-start">Start</Label>
            <Input
              id="t-start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-end">End</Label>
            <Input
              id="t-end"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Color</Label>
          <div className="flex flex-wrap gap-2">
            {SHIFT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={cn(
                  "size-7 rounded-full border-2",
                  color === c ? "border-foreground" : "border-transparent",
                )}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>
        <div>
          <Button onClick={submit} disabled={busy}>
            Add template
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function ShiftTemplatesSettings() {
  const templates = useQuery(api.shiftTemplates.list)
  const update = useMutation(api.shiftTemplates.update)
  const remove = useMutation(api.shiftTemplates.remove)

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <AddTemplate />

      <Card>
        <CardHeader>
          <CardTitle>Shift templates</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {templates === undefined ? (
            <Skeleton className="h-16 w-full" />
          ) : templates.length === 0 ? (
            <p className="text-muted-foreground text-sm">No templates yet.</p>
          ) : (
            templates.map((t) => (
              <div
                key={t._id}
                className="flex items-center gap-3 rounded-md border p-3"
              >
                <span
                  className="size-3.5 rounded-full"
                  style={{ backgroundColor: t.color }}
                />
                <div className="flex-1">
                  <div className="font-medium">{t.name}</div>
                  <div className="text-muted-foreground text-sm">
                    {t.startTime}–{t.endTime} ·{" "}
                    {formatMinutes(
                      shiftDurationMinutes(t.startTime, t.endTime, t.breakMinutes),
                    )}{" "}
                    · {t.breakMinutes}m break
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={t.active}
                    onCheckedChange={(active) =>
                      update({ id: t._id as Id<"shiftTemplates">, active })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={async () => {
                      try {
                        await remove({ id: t._id as Id<"shiftTemplates"> })
                        toast.success("Template removed")
                      } catch (e) {
                        toast.error(
                          e instanceof Error ? e.message : "Couldn't remove",
                        )
                      }
                    }}
                    aria-label="Delete template"
                  >
                    <IconTrash className="size-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
