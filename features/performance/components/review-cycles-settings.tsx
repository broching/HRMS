"use client"

import { getErrorMessage } from "@/lib/errors"
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
import { Skeleton } from "@/components/ui/skeleton"
import type { FunctionReturnType } from "convex/server"
import {
  CYCLE_STATUS_BADGE,
  CYCLE_STATUS_LABELS,
} from "@/features/performance/lib/labels"
import { CycleFormDialog } from "@/features/performance/components/cycle-form-dialog"
import { CycleScheduleDialog } from "@/features/performance/components/cycle-schedule-dialog"
import { ModuleEmailSettings } from "@/features/org-settings/components/email-settings"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"

type Cycle = FunctionReturnType<typeof api.reviewCycles.list>[number]

function ReleaseDialog({
  cycle,
  onClose,
}: {
  cycle: Cycle | null
  onClose: () => void
}) {
  const preview = useQuery(
    api.reviewCycles.audiencePreview,
    cycle ? { cycleId: cycle._id } : "skip",
  )
  const activate = useMutation(api.reviewCycles.activate)
  const [busy, setBusy] = React.useState(false)

  async function release() {
    if (!cycle) return
    setBusy(true)
    try {
      const r = await activate({ cycleId: cycle._id })
      toast.success(`Released — ${r.created} participant(s) notified.`)
      onClose()
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't release."))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!cycle} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Release {cycle?.name}?</DialogTitle>
          <DialogDescription>
            This opens the form for everyone below and notifies them. Both the
            employee and appraiser sides open immediately.
          </DialogDescription>
        </DialogHeader>
        {preview === undefined ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="text-sm">
            <p className="font-medium">
              {preview.count} participant{preview.count === 1 ? "" : "s"}
            </p>
            {preview.count === 0 ? (
              <p className="text-muted-foreground mt-1">
                No one matches this audience yet — set the audience first.
              </p>
            ) : (
              <p className="text-muted-foreground mt-1">
                {preview.names.join(", ")}
                {preview.overflow > 0 && ` +${preview.overflow} more`}
              </p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button
            onClick={release}
            disabled={busy || (preview?.count ?? 0) === 0}
          >
            {busy ? "Releasing…" : "Release now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreateCycle() {
  const templates = useQuery(api.appraisalFormTemplates.list, {})
  const create = useMutation(api.reviewCycles.create)
  const [name, setName] = React.useState("")
  const [start, setStart] = React.useState("")
  const [end, setEnd] = React.useState("")
  const [scale, setScale] = React.useState("5")
  const [templateId, setTemplateId] = React.useState<string>("")
  const [busy, setBusy] = React.useState(false)

  // Default to the first template once loaded.
  React.useEffect(() => {
    if (templates && templates.length > 0 && !templateId) {
      setTemplateId(templates[0]._id)
    }
  }, [templates, templateId])

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
        templateId: templateId
          ? (templateId as Id<"appraisalFormTemplates">)
          : undefined,
      })
      toast.success("Cycle created — build the form, set the audience, then release.")
      setName("")
      setStart("")
      setEnd("")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't create"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New appraisal cycle</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rc-name">Name</Label>
            <Input
              id="rc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="H1 2026 Appraisal"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rc-template">Form template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger id="rc-template">
                <SelectValue placeholder="Choose a template…" />
              </SelectTrigger>
              <SelectContent>
                {(templates ?? []).map((t) => (
                  <SelectItem key={t._id} value={t._id}>
                    {t.name}
                    {t.isSystemDefault ? " (default)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rc-scale">Rating scale max</Label>
            <Input
              id="rc-scale"
              inputMode="numeric"
              value={scale}
              onChange={(e) => setScale(e.target.value)}
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
  const close = useMutation(api.reviewCycles.close)
  const remove = useMutation(api.reviewCycles.remove)
  const activate = useMutation(api.reviewCycles.activate)
  const [formCycle, setFormCycle] = React.useState<Cycle | null>(null)
  const [scheduleCycle, setScheduleCycle] = React.useState<Cycle | null>(null)
  const [releaseCycle, setReleaseCycle] = React.useState<Cycle | null>(null)
  const [closeCycleTarget, setCloseCycleTarget] = React.useState<Cycle | null>(null)

  async function run(p: Promise<unknown>, ok: string) {
    try {
      await p
      toast.success(ok)
    } catch (e) {
      toast.error(getErrorMessage(e, "Action failed"))
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
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setFormCycle(c)}
                  >
                    {c.status === "draft" ? "Build form" : "View form"}
                  </Button>
                  {c.status !== "closed" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setScheduleCycle(c)}
                    >
                      Audience & schedule
                    </Button>
                  )}
                  {c.status === "draft" && (
                    <Button size="sm" onClick={() => setReleaseCycle(c)}>
                      Release
                    </Button>
                  )}
                  {c.status === "active" && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          run(
                            activate({ cycleId: c._id as Id<"reviewCycles"> }).then(
                              (r) =>
                                toast.message(`${r.created} new review(s) added`),
                            ),
                            "Synced",
                          )
                        }
                      >
                        Sync
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setCloseCycleTarget(c)}
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

      <Card>
        <CardHeader>
          <CardTitle>Email notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <ModuleEmailSettings module="performance" />
        </CardContent>
      </Card>

      <CycleFormDialog cycle={formCycle} onClose={() => setFormCycle(null)} />
      <CycleScheduleDialog
        cycle={scheduleCycle}
        onClose={() => setScheduleCycle(null)}
      />
      <ReleaseDialog
        cycle={releaseCycle}
        onClose={() => setReleaseCycle(null)}
      />
      <ConfirmDialog
        open={!!closeCycleTarget}
        onOpenChange={(o) => !o && setCloseCycleTarget(null)}
        title="Close this cycle?"
        description={
          closeCycleTarget
            ? `Closing "${closeCycleTarget.name}" finalises it — no further self-reviews or appraisals can be submitted. This can't be undone.`
            : undefined
        }
        confirmLabel="Close cycle"
        destructive
        onConfirm={async () => {
          if (!closeCycleTarget) return
          await run(
            close({ cycleId: closeCycleTarget._id as Id<"reviewCycles"> }),
            "Cycle closed",
          )
          setCloseCycleTarget(null)
        }}
      />
    </div>
  )
}
