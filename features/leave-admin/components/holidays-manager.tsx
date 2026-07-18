"use client"

import { getErrorMessage } from "@/lib/errors"
import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { IconPlus, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

// Public holiday calendar, moved out of the old Leave Types settings page into
// the HR Lounge → Leave module. Gated by the enclosing leave admin screen
// (leave:config).
export function HolidaysManager() {
  const holidays = useQuery(api.holidays.list, {})
  const create = useMutation(api.holidays.create)
  const remove = useMutation(api.holidays.remove)
  const [date, setDate] = React.useState("")
  const [name, setName] = React.useState("")

  async function add() {
    if (!date || !name.trim()) return
    try {
      await create({ date, name: name.trim() })
      setDate("")
      setName("")
    } catch (e) {
      toast.error(getErrorMessage(e, "Failed"))
    }
  }

  const sorted = [...(holidays ?? [])].sort((a, b) => (a.date < b.date ? -1 : 1))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Public holidays</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-44"
          />
          <Input
            placeholder="Holiday name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button onClick={add} disabled={!date || !name.trim()}>
            <IconPlus className="size-4" />
            Add
          </Button>
        </div>
        <div className="divide-y rounded-md border">
          {sorted.length === 0 ? (
            <p className="text-muted-foreground p-3 text-sm">No holidays.</p>
          ) : (
            sorted.map((h) => (
              <div
                key={h._id}
                className="flex items-center justify-between p-2 pl-3 text-sm"
              >
                <span>
                  <span className="text-muted-foreground tabular-nums">
                    {h.date}
                  </span>{" "}
                  · {h.name}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => remove({ id: h._id })}
                >
                  <IconTrash className="size-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
