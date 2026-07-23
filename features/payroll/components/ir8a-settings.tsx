"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import {
  IconInfoCircle,
  IconChevronRight,
  IconPlus,
  IconX,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Ir8aCategory } from "@/convex/lib/enums"
import { PAYROLL_ITEM_PRESETS } from "@/convex/lib/ir8aPresets"
import { permitted } from "@/convex/lib/permissions"
import { useCurrentMember } from "@/hooks/use-current-member"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getErrorMessage } from "@/lib/errors"
import {
  IR8A_CATEGORIES,
  IR8A_CATEGORY_LABELS,
} from "@/features/payroll/lib/ir8a-labels"
import { cn } from "@/lib/utils"

const UNCLASSIFIED = "__unclassified__"

// Read-only list of the system-default item classifications, shown collapsed.
// These seed every org — HR can't edit them here (override by classifying the
// same label above), but seeing them explains why common items arrive mapped.
function SystemDefaults() {
  const [open, setOpen] = React.useState(false)
  const presets = React.useMemo(
    () =>
      [...PAYROLL_ITEM_PRESETS].sort(
        (a, b) =>
          IR8A_CATEGORY_LABELS[a.category].localeCompare(
            IR8A_CATEGORY_LABELS[b.category],
          ) || a.label.localeCompare(b.label),
      ),
    [],
  )
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="hover:bg-muted/40 flex w-full items-center gap-2 rounded-lg px-3 py-3 text-left text-sm font-medium"
        aria-expanded={open}
      >
        <IconChevronRight
          className={cn(
            "text-muted-foreground size-4 transition-transform",
            open && "rotate-90",
          )}
        />
        <span className="flex-1">System defaults</span>
        <span className="text-muted-foreground text-xs font-normal">
          {presets.length} items · read-only
        </span>
      </button>
      {open && (
        <div className="border-t">
          {presets.map((p) => (
            <div
              key={p.label}
              className="flex items-center justify-between gap-3 border-b px-3 py-2.5 text-sm last:border-b-0"
            >
              <span className="text-muted-foreground">{p.label}</span>
              <Badge variant="secondary" className="font-normal">
                {IR8A_CATEGORY_LABELS[p.category]}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Classify each distinct payslip earning label into an IR8A income category.
// Base pay & overtime auto-classify as gross salary and don't appear here.
export function Ir8aSettings() {
  const member = useCurrentMember()
  const canClassify = permitted(member?.permissions, "payroll:classify")
  const canAis = permitted(member?.permissions, "payroll:ais")
  const labels = useQuery(
    api.ir8a.earningLabelOptions,
    canClassify ? {} : "skip",
  )
  const settings = useQuery(api.payrollSettings.get)
  const save = useMutation(api.payrollSettings.saveIr8aMap)
  const setAisEmployer = useMutation(api.payrollSettings.setAisEmployer)
  const [assignments, setAssignments] = React.useState<Record<string, string>>({})
  // Brand-new items typed here (not yet on any payslip or in the map).
  const [newRows, setNewRows] = React.useState<
    { label: string; category: string }[]
  >([])
  const [saving, setSaving] = React.useState(false)

  async function handleToggleAis(enabled: boolean) {
    try {
      await setAisEmployer({ enabled })
      toast.success(
        enabled
          ? "AIS statement will be shown on IR8A PDFs"
          : "AIS statement hidden",
      )
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not update setting"))
    }
  }

  // Seed local edits once the labels load / change.
  React.useEffect(() => {
    if (!labels) return
    const next: Record<string, string> = {}
    for (const l of labels) next[l.normalized] = l.category ?? UNCLASSIFIED
    setAssignments(next)
  }, [labels])

  async function handleSave() {
    if (!labels) return
    // Validate any typed rows: a name needs a classification and vice-versa.
    for (const r of newRows) {
      const named = !!r.label.trim()
      const classified = r.category !== UNCLASSIFIED
      if (named !== classified) {
        toast.error(
          named
            ? `Classify "${r.label.trim()}" or remove the row.`
            : "Name the new item or remove the empty row.",
        )
        return
      }
    }
    setSaving(true)
    try {
      // Existing labels take precedence; new rows are folded in (last wins).
      const merged = new Map<string, Ir8aCategory>()
      for (const [label, category] of Object.entries(assignments)) {
        if (category !== UNCLASSIFIED) merged.set(label, category as Ir8aCategory)
      }
      for (const r of newRows) {
        const label = r.label.trim().toLowerCase()
        if (label && r.category !== UNCLASSIFIED) {
          merged.set(label, r.category as Ir8aCategory)
        }
      }
      const ir8aLabelMap = [...merged.entries()].map(([label, category]) => ({
        label,
        category,
      }))
      await save({ ir8aLabelMap })
      setNewRows([])
      toast.success("IR8A classification saved")
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not save classification"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      {/* AIS-registered employer toggle */}
      {canAis && (
      <div className="flex items-start justify-between gap-4 rounded-md border p-3">
        <div>
          <Label htmlFor="ais-employer" className="text-sm font-medium">
            AIS-registered employer
          </Label>
          <p className="text-muted-foreground mt-0.5 text-sm">
            When on, the mandatory IRAS Auto-Inclusion Scheme retention statement
            is printed on each IR8A PDF. Only enable this if your organisation is
            registered under AIS.
          </p>
        </div>
        <Switch
          id="ais-employer"
          checked={settings?.aisEmployer ?? false}
          onCheckedChange={handleToggleAis}
          disabled={settings === undefined}
        />
      </div>
      )}

      {!canClassify ? null : (
      <>
      <div className="text-muted-foreground flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm">
        <IconInfoCircle className="mt-0.5 size-4 shrink-0" />
        <p>
          Each earning&apos;s IR8A income field. Common items are classified by a
          system default, and anything you classify when adding a payroll item
          shows here too — this is the master list, editable any time.{" "}
          <strong>Base pay</strong> and <strong>overtime</strong> classify as
          gross salary automatically. Anything left unclassified is flagged for
          review on each form.
        </p>
      </div>

      <SystemDefaults />

      {labels === undefined ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Classifications</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setNewRows((r) => [...r, { label: "", category: UNCLASSIFIED }])
              }
            >
              <IconPlus className="size-4" />
              Add item
            </Button>
          </div>

          {labels.length === 0 && newRows.length === 0 ? (
            <div className="text-muted-foreground rounded-lg border border-dashed py-12 text-center text-sm">
              No payslip earnings to classify yet. Add an item above, or run
              payroll and classify the allowances that appear here.
            </div>
          ) : (
            <div className="rounded-lg border">
              {labels.map((l) => (
                <div
                  key={l.normalized}
                  className="flex items-center gap-3 border-b p-3 last:border-b-0"
                >
                  <div className="flex-1">
                    <div className="font-medium">{l.label}</div>
                    <div className="text-muted-foreground text-xs">
                      {l.count > 0 ? (
                        `Seen on ${l.count} payslip${l.count === 1 ? "" : "s"}`
                      ) : (
                        <Badge variant="outline" className="text-[10px]">
                          Not yet on a payslip
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Select
                    value={assignments[l.normalized] ?? UNCLASSIFIED}
                    onValueChange={(val) =>
                      setAssignments((prev) => ({ ...prev, [l.normalized]: val }))
                    }
                  >
                    <SelectTrigger className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNCLASSIFIED}>Unclassified</SelectItem>
                      {IR8A_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {IR8A_CATEGORY_LABELS[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              {newRows.map((r, i) => (
                <div
                  key={`new-${i}`}
                  className="flex items-center gap-3 border-b p-3 last:border-b-0"
                >
                  <Input
                    value={r.label}
                    placeholder="New item name"
                    className="flex-1"
                    onChange={(e) =>
                      setNewRows((rows) =>
                        rows.map((row, idx) =>
                          idx === i ? { ...row, label: e.target.value } : row,
                        ),
                      )
                    }
                  />
                  <Select
                    value={r.category}
                    onValueChange={(val) =>
                      setNewRows((rows) =>
                        rows.map((row, idx) =>
                          idx === i ? { ...row, category: val } : row,
                        ),
                      )
                    }
                  >
                    <SelectTrigger className="w-56">
                      <SelectValue placeholder="Classify" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNCLASSIFIED}>Unclassified</SelectItem>
                      {IR8A_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {IR8A_CATEGORY_LABELS[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove item"
                    onClick={() =>
                      setNewRows((rows) => rows.filter((_, idx) => idx !== i))
                    }
                  >
                    <IconX className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save classification"}
            </Button>
          </div>
        </>
      )}
      </>
      )}
    </div>
  )
}
