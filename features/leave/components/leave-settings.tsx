"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { IconPlus, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

function LeaveTypesCard() {
  const types = useQuery(api.leaveTypes.list, { includeInactive: true })
  const update = useMutation(api.leaveTypes.update)
  const seed = useMutation(api.leaveTypes.seedDefaults)

  async function toggle(id: Id<"leaveTypes">, active: boolean) {
    await update({ id, active })
  }
  async function setEntitlement(id: Id<"leaveTypes">, days: number) {
    await update({ id, defaultEntitlementDays: days })
    toast.success("Updated")
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Leave types</CardTitle>
        {types && types.length === 0 && (
          <Button
            size="sm"
            onClick={async () => {
              try {
                await seed({})
                toast.success("Singapore defaults seeded")
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed")
              }
            }}
          >
            Seed Singapore defaults
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="w-32">Entitlement</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead>Active</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {types?.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-muted-foreground py-6 text-center"
                >
                  No leave types yet.
                </TableCell>
              </TableRow>
            ) : (
              types?.map((t) => (
                <TableRow key={t._id}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: t.color }}
                      />
                      {t.name}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {t.category}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      defaultValue={t.defaultEntitlementDays}
                      className="h-8 w-20"
                      onBlur={(e) => {
                        const v = Number(e.target.value)
                        if (v !== t.defaultEntitlementDays) setEntitlement(t._id, v)
                      }}
                    />
                  </TableCell>
                  <TableCell>{t.paid ? "Yes" : "No"}</TableCell>
                  <TableCell>
                    <Switch
                      checked={t.active}
                      onCheckedChange={(c) => toggle(t._id, c)}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function HolidaysCard() {
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
      toast.error(e instanceof Error ? e.message : "Failed")
    }
  }

  const sorted = [...(holidays ?? [])].sort((a, b) =>
    a.date < b.date ? -1 : 1,
  )

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

export function LeaveSettings() {
  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <LeaveTypesCard />
      <HolidaysCard />
    </div>
  )
}
