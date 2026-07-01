"use client"

import * as React from "react"
import Link from "next/link"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import {
  IconArrowLeft,
  IconChevronLeft,
  IconTargetArrow,
  IconAward,
} from "@tabler/icons-react"
import type { FunctionReturnType } from "convex/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
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
import {
  FEEDBACK360_RELATIONSHIP_LABELS,
  FEEDBACK360_RELATIONSHIPS,
} from "@/features/performance/lib/labels"
import { IconTrash } from "@tabler/icons-react"

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

type FormTab = "questionnaire" | "objectives" | "competencies" | "summary"

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
  const ensureComps = useMutation(api.reviewCompetencies.ensureForReview)

  const [rail, setRail] = React.useState<RailKey>("form")

  // Seed competency lines once so the appraisal form has rows to rate.
  const seeded = React.useRef(false)
  React.useEffect(() => {
    if (!seeded.current && competencies && competencies.length === 0) {
      seeded.current = true
      ensureComps({ reviewId }).catch(() => {})
    }
  }, [competencies, ensureComps, reviewId])

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
            <AppraisalForm
              data={data}
              objectives={objectives}
              competencies={competencies}
              reviewId={reviewId}
            />
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

// ─── Objectives (config view) ─────────────────────────────────────────────

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
            onClick={async () => {
              const r = await confirmFromGoals({ reviewId })
              toast.success(
                r.created > 0
                  ? `Imported ${r.created} objective(s) from goals.`
                  : "No goals found to import.",
              )
            }}
          >
            Confirm objectives from goals
          </Button>
        )}
      </div>
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

// ─── Competencies (config view) ───────────────────────────────────────────

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

// ─── Appraisal form ───────────────────────────────────────────────────────

function AppraisalForm({
  data,
  objectives,
  competencies,
  reviewId,
}: {
  data: Appraisal
  objectives: Objective[] | undefined
  competencies: Competency[] | undefined
  reviewId: Id<"reviews">
}) {
  const [tab, setTab] = React.useState<FormTab>("questionnaire")
  const reopen = useMutation(api.reviews.reopenAppraisal)

  const TABS: { key: FormTab; label: string }[] = [
    { key: "questionnaire", label: "1. Questionnaire" },
    { key: "objectives", label: "2. Objectives Feedback" },
    { key: "competencies", label: "3. Competencies feedback" },
    { key: "summary", label: "4. Summary" },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <h2 className="text-lg font-semibold">Appraisal form</h2>
        {data.status === "completed" && data.canAppraiser && (
          <Button
            variant="destructive"
            size="sm"
            onClick={async () => {
              await reopen({ reviewId })
              toast.success("Appraisal re-opened.")
            }}
          >
            Re-open Appraisal
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 border-b pb-3">
        <div className="text-muted-foreground text-sm">
          Appraiser: {data.appraiserName ?? "—"}
        </div>
        <div className="text-right">
          <p className="text-muted-foreground text-xs">
            Overall rating by {data.appraiserName ?? "appraiser"}
          </p>
          <div className="flex items-center justify-end gap-2">
            <RatingInput
              value={data.overallRating != null ? Math.round(data.overallRating) : null}
              max={data.ratingScaleMax}
              readOnly
            />
            <span className="font-semibold">
              {data.overallRating != null ? data.overallRating.toFixed(1) : "—"}
            </span>
          </div>
          {data.ratingBand && (
            <p className="text-muted-foreground text-xs">{data.ratingBand}</p>
          )}
        </div>
      </div>

      <nav className="flex flex-wrap gap-4 border-b text-sm">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "border-b-2 pb-2 transition-colors",
              tab === t.key
                ? "border-primary text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "questionnaire" && (
        <QuestionnaireTab data={data} reviewId={reviewId} />
      )}
      {tab === "objectives" && (
        <ObjectivesFeedbackTab data={data} objectives={objectives} />
      )}
      {tab === "competencies" && (
        <CompetenciesFeedbackTab data={data} competencies={competencies} />
      )}
      {tab === "summary" && <SummaryTab data={data} reviewId={reviewId} />}
    </div>
  )
}

function QuestionnaireTab({
  data,
  reviewId,
}: {
  data: Appraisal
  reviewId: Id<"reviews">
}) {
  const saveAnswer = useMutation(api.reviews.saveAnswer)
  if (data.questionnaire.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        This cycle has no questionnaire configured.
      </p>
    )
  }
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {data.questionnaire.map((q, i) => (
        <div key={i} className="flex flex-col gap-2">
          <p className="text-sm font-medium">{q.question}</p>
          <AnswerCard
            author="Employee"
            value={q.selfAnswer}
            editable={data.canSelf}
            onSave={(answer) =>
              saveAnswer({ reviewId, side: "self", index: i, answer })
            }
          />
          <AnswerCard
            author="Appraiser"
            value={q.appraiserAnswer}
            editable={data.canAppraiser}
            onSave={(answer) =>
              saveAnswer({ reviewId, side: "appraiser", index: i, answer })
            }
          />
        </div>
      ))}
    </div>
  )
}

function ObjectivesFeedbackTab({
  data,
  objectives,
}: {
  data: Appraisal
  objectives: Objective[] | undefined
}) {
  const rate = useMutation(api.reviewObjectives.rate)
  if (objectives === undefined) return <Skeleton className="h-40 w-full" />
  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground text-sm">
        Objectives carry {data.objectivesWeightPct}% of the appraisal&apos;s
        weightage.
      </p>
      {objectives.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No objectives to rate. Confirm objectives first.
        </p>
      ) : (
        objectives.map((o) => (
          <div key={o._id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IconTargetArrow className="text-muted-foreground size-4" />
                <span className="font-medium">{o.title}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Badge variant="secondary">{o.progress}%</Badge>
                <Badge variant="outline">{o.weight}%</Badge>
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <RateCard
                author="Employee"
                rating={o.selfRating}
                comment={o.selfComment}
                max={data.ratingScaleMax}
                editable={data.canSelf}
                onRate={(rating) =>
                  rate({ objectiveId: o._id, side: "self", rating })
                }
                onComment={(comment) =>
                  rate({ objectiveId: o._id, side: "self", comment })
                }
              />
              <RateCard
                author="Appraiser"
                rating={o.appraiserRating}
                comment={o.appraiserComment}
                max={data.ratingScaleMax}
                editable={data.canAppraiser}
                onRate={(rating) =>
                  rate({ objectiveId: o._id, side: "appraiser", rating })
                }
                onComment={(comment) =>
                  rate({ objectiveId: o._id, side: "appraiser", comment })
                }
              />
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function CompetenciesFeedbackTab({
  data,
  competencies,
}: {
  data: Appraisal
  competencies: Competency[] | undefined
}) {
  const rate = useMutation(api.reviewCompetencies.rate)
  if (competencies === undefined) return <Skeleton className="h-40 w-full" />
  const groups = groupByCategory(competencies)
  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground text-sm">
        Competencies carry {data.competenciesWeightPct}% of the appraisal&apos;s
        weightage.
      </p>
      {groups.map((g) => (
        <div key={g.category} className="flex flex-col gap-3">
          <p className="text-primary font-semibold">{g.category}</p>
          {g.items.map((c) => (
            <div key={c._id} className="flex flex-col gap-2">
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
                <p className="text-muted-foreground text-sm">{c.description}</p>
              )}
              <div className="grid gap-2 md:grid-cols-2">
                <RateCard
                  author="Employee"
                  rating={c.selfRating}
                  comment={c.selfComment}
                  max={data.ratingScaleMax}
                  editable={data.canSelf}
                  onRate={(rating) =>
                    rate({ competencyId: c._id, side: "self", rating })
                  }
                  onComment={(comment) =>
                    rate({ competencyId: c._id, side: "self", comment })
                  }
                />
                <RateCard
                  author="Appraiser"
                  rating={c.appraiserRating}
                  comment={c.appraiserComment}
                  max={data.ratingScaleMax}
                  editable={data.canAppraiser}
                  onRate={(rating) =>
                    rate({ competencyId: c._id, side: "appraiser", rating })
                  }
                  onComment={(comment) =>
                    rate({ competencyId: c._id, side: "appraiser", comment })
                  }
                />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function SummaryTab({
  data,
  reviewId,
}: {
  data: Appraisal
  reviewId: Id<"reviews">
}) {
  const submitSelf = useMutation(api.reviews.submitSelfAppraisal)
  const submitAppraiser = useMutation(api.reviews.submitAppraiserAppraisal)
  const acknowledge = useMutation(api.reviews.acknowledgeAppraisal)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatBox label="Objectives score" value={data.objectivesScore} weight={data.objectivesWeightPct} />
        <StatBox label="Competencies score" value={data.competenciesScore} weight={data.competenciesWeightPct} />
        <StatBox label="Overall" value={data.overallRating} band={data.ratingBand} />
      </div>

      <div className="flex flex-wrap gap-2">
        {data.canSelf && (
          <Button
            onClick={async () => {
              await submitSelf({ reviewId })
              toast.success("Self-appraisal submitted.")
            }}
          >
            Submit self-appraisal
          </Button>
        )}
        {data.canAppraiser && (
          <Button
            onClick={async () => {
              await submitAppraiser({ reviewId })
              toast.success("Appraisal completed.")
            }}
          >
            Complete appraisal
          </Button>
        )}
        {data.canAcknowledge && (
          <Button
            variant="outline"
            onClick={async () => {
              await acknowledge({ reviewId })
              toast.success("Appraisal acknowledged.")
            }}
          >
            Acknowledge
          </Button>
        )}
      </div>

      <div className="text-muted-foreground text-xs">
        {data.selfSubmittedAt && <p>Self-appraisal submitted.</p>}
        {data.managerSubmittedAt && <p>Appraiser review completed.</p>}
        {data.acknowledgedAt && <p>Acknowledged by employee.</p>}
      </div>
    </div>
  )
}

function StatBox({
  label,
  value,
  weight,
  band,
}: {
  label: string
  value: number | null
  weight?: number
  band?: string | null
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-muted-foreground text-xs">
          {label}
          {weight != null ? ` · ${weight}%` : ""}
        </p>
        <p className="text-2xl font-semibold">
          {value != null ? value.toFixed(1) : "—"}
        </p>
        {band && <p className="text-muted-foreground text-xs">{band}</p>}
      </CardContent>
    </Card>
  )
}

// ─── 360 feedback (results panel — assignment UI added in Phase 3) ─────────

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
      toast.error(e instanceof Error ? e.message : "Could not assign.")
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

function AnswerCard({
  author,
  value,
  editable,
  onSave,
}: {
  author: string
  value: string | null
  editable: boolean
  onSave: (answer: string) => Promise<unknown>
}) {
  const [draft, setDraft] = React.useState(value ?? "")
  React.useEffect(() => setDraft(value ?? ""), [value])
  return (
    <div className="bg-muted/40 rounded-md border p-3">
      <p className="text-muted-foreground mb-1 text-xs">{author}</p>
      {editable ? (
        <Textarea
          value={draft}
          rows={2}
          placeholder="Write an answer…"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== (value ?? "")) onSave(draft).catch(() => toast.error("Could not save."))
          }}
        />
      ) : (
        <p className="text-sm">{value || <span className="text-muted-foreground">No answer.</span>}</p>
      )}
    </div>
  )
}

function RateCard({
  author,
  rating,
  comment,
  max,
  editable,
  onRate,
  onComment,
}: {
  author: string
  rating: number | null
  comment: string | null
  max: number
  editable: boolean
  onRate: (rating: number) => Promise<unknown>
  onComment: (comment: string) => Promise<unknown>
}) {
  const [draft, setDraft] = React.useState(comment ?? "")
  React.useEffect(() => setDraft(comment ?? ""), [comment])
  return (
    <div className="bg-muted/40 flex flex-col gap-2 rounded-md border p-3">
      <p className="text-muted-foreground text-xs">{author}</p>
      <RatingInput
        value={rating}
        max={max}
        readOnly={!editable}
        onChange={(v) => onRate(v).catch(() => toast.error("Could not save rating."))}
      />
      {editable ? (
        <Textarea
          value={draft}
          rows={2}
          placeholder="Add a comment…"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== (comment ?? "")) onComment(draft).catch(() => toast.error("Could not save."))
          }}
        />
      ) : (
        comment && <p className="text-sm">{comment}</p>
      )}
    </div>
  )
}

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
