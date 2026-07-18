"use client"

import { getErrorMessage } from "@/lib/errors"
import * as React from "react"
import Link from "next/link"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import {
  IconArrowLeft,
  IconChevronLeft,
  IconTargetArrow,
  IconAward,
  IconTrash,
} from "@tabler/icons-react"
import type { FunctionReturnType } from "convex/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { RatingInput } from "@/features/performance/components/rating-input"
import { AppraisalFill } from "@/features/performance/components/appraisal-fill"
import {
  FEEDBACK360_RELATIONSHIP_LABELS,
  FEEDBACK360_RELATIONSHIPS,
} from "@/features/performance/lib/labels"

type Appraisal = FunctionReturnType<typeof api.reviews.getAppraisal>
type Objective = FunctionReturnType<typeof api.reviewObjectives.forReview>[number]
type Competency =
  FunctionReturnType<typeof api.reviewCompetencies.forReview>[number]

type RailKey =
  | "objectives"
  | "competencies"
  | "training"
  | "form"
  | "oneOnOne"
  | "feedback360"

const RAIL: { key: RailKey; label: string }[] = [
  { key: "objectives", label: "Objectives" },
  { key: "competencies", label: "Competencies" },
  { key: "training", label: "Training Plan" },
  { key: "form", label: "Appraisal Form" },
  { key: "oneOnOne", label: "1 On 1 Feedback" },
  { key: "feedback360", label: "360 Feedback" },
]

function fmt(iso: string): string {
  if (!iso) return "—"
  const d = new Date(iso + "T00:00:00")
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
}

export function AppraisalDetail({ reviewId }: { reviewId: Id<"reviews"> }) {
  const data = useQuery(api.reviews.getAppraisal, { reviewId })
  const objectives = useQuery(api.reviewObjectives.forReview, { reviewId })
  const competencies = useQuery(api.reviewCompetencies.forReview, { reviewId })
  const reopen = useMutation(api.reviews.reopenAppraisal)

  const [rail, setRail] = React.useState<RailKey>("form")

  if (data === undefined) {
    return (
      <div className="flex flex-col gap-4 px-4 py-4 lg:px-6">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <AppraisalHeader data={data} />
      <div className="flex flex-col gap-6 px-4 py-6 lg:flex-row lg:px-6">
        <aside className="lg:w-52 lg:shrink-0">
          <nav className="flex gap-1 overflow-x-auto lg:flex-col">
            {RAIL.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setRail(item.key)}
                className={cn(
                  "rounded-md px-3 py-2 text-left text-sm whitespace-nowrap transition-colors",
                  rail === item.key
                    ? "bg-muted font-medium"
                    : "text-muted-foreground hover:bg-accent/50",
                )}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          {rail === "objectives" && (
            <ObjectivesConfig data={data} objectives={objectives} reviewId={reviewId} />
          )}
          {rail === "competencies" && (
            <CompetenciesConfig competencies={competencies} />
          )}
          {rail === "form" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <h2 className="text-lg font-semibold">Appraisal form</h2>
                {data.status === "completed" && data.canViewFeedback && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={async () => {
                      await reopen({ reviewId })
                      toast.success("Appraisal re-opened.")
                    }}
                  >
                    Re-open appraisal
                  </Button>
                )}
              </div>
              <AppraisalFill reviewId={reviewId} perspective="appraiser" />
            </div>
          )}
          {rail === "training" && <ComingSoon label="Training Plan" />}
          {rail === "oneOnOne" && <ComingSoon label="1 On 1 Feedback" />}
          {rail === "feedback360" && (
            <Feedback360Panel data={data} reviewId={reviewId} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Header ───────────────────────────────────────────────────────────────

function AppraisalHeader({ data }: { data: Appraisal }) {
  return (
    <div className="border-b px-4 py-4 lg:px-6">
      <div className="text-muted-foreground mb-1 flex items-center gap-1 text-xs">
        <Link href="/hr-lounge/performance" className="hover:underline">
          Performance Dashboard
        </Link>
        <span>/</span>
        <Link
          href={`/hr-lounge/performance/report?cycleId=${data.cycleId}`}
          className="hover:underline"
        >
          Report — {data.cycleName}
        </Link>
      </div>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon" className="size-7">
            <Link href={`/hr-lounge/performance/report?cycleId=${data.cycleId}`}>
              <IconArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">{data.employeeName}</h1>
            <p className="text-muted-foreground text-sm">
              {data.employeeTitle ?? "—"}
              {data.departmentName ? ` · ${data.departmentName}` : ""}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground text-xs">
            Overall rating for {data.cycleName}
          </p>
          {data.overallRating != null ? (
            <div className="flex items-center justify-end gap-2">
              <RatingInput value={Math.round(data.overallRating)} max={data.ratingScaleMax} readOnly />
              <span className="text-lg font-semibold">
                {data.overallRating.toFixed(1)}
              </span>
            </div>
          ) : (
            <p className="text-muted-foreground max-w-[15rem] text-xs">
              Rating will be available after the appraisal is completed.
            </p>
          )}
          {data.ratingBand && (
            <p className="text-muted-foreground text-xs">{data.ratingBand}</p>
          )}
        </div>
      </div>
      <div className="text-muted-foreground mt-4 flex items-center gap-3 text-xs">
        <IconChevronLeft className="size-4" />
        <span className="font-medium text-foreground">{data.cycleName}</span>
        <span>{fmt(data.cycleStartDate)}</span>
        <span className="bg-border h-px flex-1" />
        <span>{fmt(data.cycleEndDate)}</span>
        {data.competencyLevel != null && (
          <Badge variant="outline">Level {data.competencyLevel}</Badge>
        )}
      </div>
    </div>
  )
}

// ─── Objectives (config / overview view) ──────────────────────────────────

function ObjectivesConfig({
  data,
  objectives,
  reviewId,
}: {
  data: Appraisal
  objectives: Objective[] | undefined
  reviewId: Id<"reviews">
}) {
  const confirmFromGoals = useMutation(api.reviewObjectives.confirmFromGoals)
  const canEdit = data.canSelf || data.canAppraiser
  if (objectives === undefined) return <Skeleton className="h-40 w-full" />

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Objectives</h2>
        {objectives.length === 0 && canEdit && (
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const r = await confirmFromGoals({ reviewId })
              toast.success(
                r.created > 0
                  ? `Imported ${r.created} objective(s) from goals.`
                  : "No goals found to import.",
              )
            }}
          >
            Import from goals
          </Button>
        )}
      </div>
      <p className="text-muted-foreground text-sm">
        Objectives are rated in the Appraisal Form. You can also seed them from
        the employee&apos;s goals here.
      </p>
      {objectives.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No objectives yet for this appraisal.
        </p>
      ) : (
        objectives.map((o) => (
          <Card key={o._id}>
            <CardContent className="flex items-center justify-between gap-4 pt-6">
              <div className="flex items-center gap-3">
                <IconTargetArrow className="text-muted-foreground size-5" />
                <div>
                  {o.category && (
                    <p className="text-primary text-xs font-medium">
                      {o.category}
                    </p>
                  )}
                  <p className="font-medium">{o.title}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Badge variant="secondary">{o.progress}%</Badge>
                <Badge variant="outline">Weight {o.weight}%</Badge>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}

// ─── Competencies (config / overview view) ────────────────────────────────

function CompetenciesConfig({
  competencies,
}: {
  competencies: Competency[] | undefined
}) {
  if (competencies === undefined) return <Skeleton className="h-40 w-full" />
  const groups = groupByCategory(competencies)
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Competencies</h2>
      <p className="text-muted-foreground text-sm">
        Competencies are rated in the Appraisal Form.
      </p>
      {groups.map((g) => (
        <div key={g.category}>
          <p className="text-primary mb-2 font-semibold">{g.category}</p>
          <div className="flex flex-col gap-2">
            {g.items.map((c) => (
              <Card key={c._id}>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <IconAward className="text-muted-foreground size-4" />
                      <span className="font-medium">{c.name}</span>
                      {c.level != null && (
                        <Badge variant="outline">Level {c.level}</Badge>
                      )}
                    </div>
                    {c.weightPct > 0 && (
                      <Badge variant="secondary">{c.weightPct}%</Badge>
                    )}
                  </div>
                  {c.description && (
                    <p className="text-muted-foreground mt-1 text-sm">
                      {c.description}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── 360 feedback ─────────────────────────────────────────────────────────

function Feedback360Panel({ data }: { data: Appraisal; reviewId: Id<"reviews"> }) {
  const canView = data.canViewFeedback
  const assignments = useQuery(
    api.feedback360.forSubject,
    canView
      ? { subjectEmployeeId: data.employeeId, cycleId: data.cycleId }
      : "skip",
  )
  const directory = useQuery(
    api.employees.directoryOptions,
    canView ? {} : "skip",
  )
  const assign = useMutation(api.feedback360.assign)
  const remove = useMutation(api.feedback360.remove)

  const [giverId, setGiverId] = React.useState<string>("")
  const [relationship, setRelationship] = React.useState<
    (typeof FEEDBACK360_RELATIONSHIPS)[number]
  >("peer")

  if (!canView) {
    return (
      <p className="text-muted-foreground text-sm">
        360 feedback results are visible to HR and the employee&apos;s manager
        only.
      </p>
    )
  }

  const givers = (directory ?? []).filter((e) => e._id !== data.employeeId)

  async function handleAssign() {
    if (!giverId) {
      toast.error("Pick who should give feedback.")
      return
    }
    try {
      await assign({
        cycleId: data.cycleId,
        subjectEmployeeId: data.employeeId,
        giverEmployeeId: giverId as Id<"employees">,
        relationship,
      })
      setGiverId("")
      toast.success("Feedback giver assigned.")
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not assign."))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">360 Feedback</h2>
        <p className="text-muted-foreground text-sm">
          Assign colleagues to give anonymous feedback. Results are visible to HR
          and the manager only.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-2 pt-6">
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">Feedback giver</span>
            <Select value={giverId} onValueChange={setGiverId}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Select employee" />
              </SelectTrigger>
              <SelectContent>
                {givers.map((e) => (
                  <SelectItem key={e._id} value={e._id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">Relationship</span>
            <Select
              value={relationship}
              onValueChange={(v) =>
                setRelationship(v as (typeof FEEDBACK360_RELATIONSHIPS)[number])
              }
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FEEDBACK360_RELATIONSHIPS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {FEEDBACK360_RELATIONSHIP_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleAssign}>Assign</Button>
        </CardContent>
      </Card>

      {assignments === undefined ? (
        <Skeleton className="h-40 w-full" />
      ) : assignments.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No feedback givers assigned yet.
        </p>
      ) : (
        assignments.map((a) => (
          <Card key={a._id}>
            <CardContent className="flex flex-col gap-3 pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{a.giverName ?? "—"}</span>
                  <Badge variant="outline">
                    {FEEDBACK360_RELATIONSHIP_LABELS[a.relationship]}
                  </Badge>
                  {a.status === "submitted" ? (
                    <Badge>Submitted</Badge>
                  ) : (
                    <Badge variant="secondary">Pending</Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={async () => {
                    await remove({ assignmentId: a._id })
                    toast.success("Assignment removed.")
                  }}
                >
                  <IconTrash className="size-4" />
                </Button>
              </div>
              {a.answers && a.answers.length > 0 && (
                <div className="flex flex-col gap-3">
                  {a.answers.map((ans, i) => (
                    <div key={i} className="border-l-2 pl-3">
                      <p className="text-sm font-medium">{ans.question}</p>
                      {ans.rating != null && (
                        <RatingInput value={ans.rating} max={data.ratingScaleMax} readOnly />
                      )}
                      {ans.comment && (
                        <p className="text-muted-foreground text-sm">
                          {ans.comment}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}

// ─── Small building blocks ────────────────────────────────────────────────

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="text-muted-foreground flex flex-col gap-2">
      <h2 className="text-foreground text-lg font-semibold">{label}</h2>
      <p className="text-sm">This section is coming soon.</p>
    </div>
  )
}

function groupByCategory<T extends { category: string }>(items: T[]) {
  const groups: { category: string; items: T[] }[] = []
  for (const it of items) {
    let g = groups.find((x) => x.category === it.category)
    if (!g) {
      g = { category: it.category, items: [] }
      groups.push(g)
    }
    g.items.push(it)
  }
  return groups
}
