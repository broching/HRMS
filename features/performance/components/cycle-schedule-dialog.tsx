"use client"

import { getErrorMessage } from "@/lib/errors"
import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { FunctionReturnType } from "convex/server"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { CycleAudienceMode } from "@/convex/lib/enums"

type Cycle = FunctionReturnType<typeof api.reviewCycles.list>[number]

const MODE_LABELS: Record<CycleAudienceMode, string> = {
  all: "Everyone (all active employees)",
  departments: "Specific departments",
  offices: "Specific offices",
  individuals: "Specific people",
}

const REMINDER_OFFSETS = [1, 3, 7, 14]

function CheckList<T extends string>({
  items,
  selected,
  onToggle,
}: {
  items: { id: T; label: string }[]
  selected: Set<T>
  onToggle: (id: T) => void
}) {
  return (
    <div className="flex max-h-52 flex-col gap-1 overflow-y-auto rounded-md border p-2">
      {items.length === 0 ? (
        <p className="text-muted-foreground p-1 text-xs">Nothing to choose.</p>
      ) : (
        items.map((it) => (
          <label
            key={it.id}
            className="hover:bg-muted/50 flex items-center gap-2 rounded px-1.5 py-1 text-sm"
          >
            <Checkbox
              checked={selected.has(it.id)}
              onCheckedChange={() => onToggle(it.id)}
            />
            {it.label}
          </label>
        ))
      )}
    </div>
  )
}

export function CycleScheduleDialog({
  cycle,
  onClose,
}: {
  cycle: Cycle | null
  onClose: () => void
}) {
  const departments = useQuery(api.departments.list, cycle ? {} : "skip")
  const offices = useQuery(api.offices.list, cycle ? {} : "skip")
  const employees = useQuery(
    api.employees.directoryOptions,
    cycle ? {} : "skip",
  )
  const setAudience = useMutation(api.reviewCycles.setAudience)
  const setDueDates = useMutation(api.reviewCycles.setDueDates)
  const setReminders = useMutation(api.reviewCycles.setReminders)

  const [mode, setMode] = React.useState<CycleAudienceMode>("all")
  const [deptIds, setDeptIds] = React.useState<Set<Id<"departments">>>(new Set())
  const [officeIds, setOfficeIds] = React.useState<Set<Id<"offices">>>(new Set())
  const [empIds, setEmpIds] = React.useState<Set<Id<"employees">>>(new Set())
  const [selfDue, setSelfDue] = React.useState("")
  const [apprDue, setApprDue] = React.useState("")
  const [remindOn, setRemindOn] = React.useState(true)
  const [offsets, setOffsets] = React.useState<Set<number>>(new Set([7, 1]))
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!cycle) return
    const a = cycle.audience
    setMode(a?.mode ?? "all")
    setDeptIds(new Set(a?.departmentIds ?? []))
    setOfficeIds(new Set(a?.officeIds ?? []))
    setEmpIds(new Set(a?.employeeIds ?? []))
    setSelfDue(cycle.dueDates?.self ?? "")
    setApprDue(cycle.dueDates?.appraiser ?? "")
    setRemindOn(cycle.reminders?.enabled ?? true)
    setOffsets(new Set(cycle.reminders?.daysBefore ?? [7, 1]))
  }, [cycle])

  function toggle<T>(set: Set<T>, setFn: (s: Set<T>) => void, id: T) {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setFn(next)
  }

  async function save() {
    if (!cycle) return
    setBusy(true)
    try {
      await setAudience({
        cycleId: cycle._id,
        audience: {
          mode,
          departmentIds: mode === "departments" ? [...deptIds] : undefined,
          officeIds: mode === "offices" ? [...officeIds] : undefined,
          employeeIds: mode === "individuals" ? [...empIds] : undefined,
        },
      })
      await setDueDates({
        cycleId: cycle._id,
        dueDates: {
          ...(selfDue ? { self: selfDue } : {}),
          ...(apprDue ? { appraiser: apprDue } : {}),
        },
      })
      await setReminders({
        cycleId: cycle._id,
        reminders: { enabled: remindOn, daysBefore: [...offsets] },
      })
      toast.success("Audience & schedule saved")
      onClose()
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!cycle} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Audience & schedule · {cycle?.name}</DialogTitle>
          <DialogDescription>
            Choose who receives the form and when it's due. Releasing the cycle
            sends it to everyone selected here.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Release to</Label>
            <Select
              value={mode}
              onValueChange={(v) => setMode(v as CycleAudienceMode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(MODE_LABELS) as CycleAudienceMode[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {MODE_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {mode === "departments" && (
            <CheckList
              items={(departments ?? []).map((d) => ({ id: d._id, label: d.name }))}
              selected={deptIds}
              onToggle={(id) => toggle(deptIds, setDeptIds, id)}
            />
          )}
          {mode === "offices" && (
            <CheckList
              items={(offices ?? []).map((o) => ({ id: o._id, label: o.name }))}
              selected={officeIds}
              onToggle={(id) => toggle(officeIds, setOfficeIds, id)}
            />
          )}
          {mode === "individuals" && (
            <CheckList
              items={(employees ?? []).map((e) => ({ id: e._id, label: e.name }))}
              selected={empIds}
              onToggle={(id) => toggle(empIds, setEmpIds, id)}
            />
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Employee due date</Label>
              <Input
                type="date"
                value={selfDue}
                onChange={(e) => setSelfDue(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Appraiser due date</Label>
              <Input
                type="date"
                value={apprDue}
                onChange={(e) => setApprDue(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-md border p-3">
            <label className="flex items-center justify-between text-sm">
              <span className="font-medium">Email reminders</span>
              <Switch checked={remindOn} onCheckedChange={setRemindOn} />
            </label>
            {remindOn && (
              <div className="flex flex-col gap-1.5">
                <span className="text-muted-foreground text-xs">
                  Remind pending participants this many days before the due date
                  (and once overdue).
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {REMINDER_OFFSETS.map((d) => {
                    const on = offsets.has(d)
                    return (
                      <Badge
                        key={d}
                        variant={on ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => toggle(offsets, setOffsets, d)}
                      >
                        {d}d before
                      </Badge>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
