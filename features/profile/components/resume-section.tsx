"use client"

import * as React from "react"
import { useMutation } from "convex/react"
import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import type { ProfileData } from "./profile-fields"
import { ResumeEntryDialog, type ResumeEntry } from "./resume-entry-dialog"

type Kind = "experience" | "education" | "trainings"

const COPY: Record<
  Kind,
  { heading: string; kindLabel: string; titleLabel: string; orgLabel: string }
> = {
  experience: {
    heading: "Professional Experience",
    kindLabel: "experience",
    titleLabel: "Job title",
    orgLabel: "Company",
  },
  education: {
    heading: "Education",
    kindLabel: "qualification",
    titleLabel: "Qualification",
    orgLabel: "Institution",
  },
  trainings: {
    heading: "Training & Certification",
    kindLabel: "certification",
    titleLabel: "Certification",
    orgLabel: "Provider",
  },
}

function fmtMonth(value?: string): string {
  if (!value) return ""
  const d = new Date(`${value}-01T00:00:00`)
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString(undefined, { month: "short", year: "numeric" })
}

function dateRange(e: ResumeEntry): string {
  const start = fmtMonth(e.startDate)
  const end = e.endDate ? fmtMonth(e.endDate) : e.startDate ? "Present" : ""
  return [start, end].filter(Boolean).join(" – ")
}

export function ResumeSection({
  employee,
  kind,
}: {
  employee: ProfileData
  kind: Kind
}) {
  const copy = COPY[kind]
  const update = useMutation(api.employees.updateOwnProfile)
  const entries = React.useMemo(
    () =>
      [...((employee[kind] ?? []) as ResumeEntry[])].sort((a, b) =>
        (b.startDate ?? "").localeCompare(a.startDate ?? ""),
      ),
    [employee, kind],
  )

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<ResumeEntry | null>(null)

  async function persist(next: ResumeEntry[]) {
    await update(
      kind === "experience"
        ? { experience: next }
        : kind === "education"
          ? { education: next }
          : { trainings: next },
    )
  }

  async function handleSave(entry: ResumeEntry) {
    const base = (employee[kind] ?? []) as ResumeEntry[]
    const exists = base.some((e) => e.id === entry.id)
    const next = exists
      ? base.map((e) => (e.id === entry.id ? entry : e))
      : [...base, entry]
    try {
      await persist(next)
      toast.success("Saved")
    } catch {
      toast.error("Could not save")
    }
  }

  async function handleDelete(id: string) {
    const next = ((employee[kind] ?? []) as ResumeEntry[]).filter(
      (e) => e.id !== id,
    )
    try {
      await persist(next)
    } catch {
      toast.error("Could not delete")
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{copy.heading}</h2>
        {employee.isSelf && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
          >
            <IconPlus className="size-4" />
            <span className="sr-only">Add {copy.kindLabel}</span>
          </Button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {employee.isSelf ? `No ${copy.kindLabel} added yet.` : "Nothing here yet."}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {entries.map((e) => (
            <div key={e.id} className="grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)_auto]">
              <p className="text-muted-foreground text-sm">{dateRange(e)}</p>
              <div className="flex flex-col gap-0.5">
                <p className="font-medium">{e.title}</p>
                {(e.organization || e.location) && (
                  <p className="text-muted-foreground text-sm">
                    {[e.organization, e.location].filter(Boolean).join(", ")}
                  </p>
                )}
                {e.description && (
                  <ClampText text={e.description} />
                )}
              </div>
              {employee.isSelf && (
                <div className="flex items-start gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => {
                      setEditing(e)
                      setDialogOpen(true)
                    }}
                  >
                    <IconPencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive size-8"
                    onClick={() => handleDelete(e.id)}
                  >
                    <IconTrash className="size-4" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ResumeEntryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        kindLabel={copy.kindLabel}
        titleLabel={copy.titleLabel}
        orgLabel={copy.orgLabel}
        initial={editing}
        onSave={handleSave}
      />
    </section>
  )
}

function ClampText({ text }: { text: string }) {
  const [expanded, setExpanded] = React.useState(false)
  const long = text.length > 180
  return (
    <div className="text-sm">
      <p className={expanded || !long ? "whitespace-pre-wrap" : "line-clamp-2"}>
        {text}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="text-primary mt-0.5 text-xs font-medium"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  )
}
