"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import { IconPaperclip, IconTrash, IconPlus } from "@tabler/icons-react"
import type { FunctionReturnType } from "convex/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/lib/utils"
import { RatingInput } from "@/features/performance/components/rating-input"
import { SignatureCaptureDialog } from "@/features/payroll/components/signature-pad"
import type {
  FormField,
  FormFieldSide,
} from "@/features/performance/lib/form-builder-model"

type FormData = FunctionReturnType<typeof api.reviews.getAppraisalForm>
type Answer = FormData["answers"][number]
type Objective = FunctionReturnType<typeof api.reviewObjectives.forReview>[number]
type Competency =
  FunctionReturnType<typeof api.reviewCompetencies.forReview>[number]

type Perspective = "employee" | "appraiser"

function sideIncludes(fieldSide: FormFieldSide, side: "self" | "appraiser") {
  return fieldSide === "both" || fieldSide === side
}

// ─── Read-only answer display ────────────────────────────────────────────────

function ReadAnswer({
  field,
  answer,
  max,
}: {
  field: FormField
  answer: Answer | undefined
  max: number
}) {
  if (!answer) return <p className="text-muted-foreground text-sm">No answer.</p>
  switch (field.type) {
    case "ratingScale":
      return <RatingInput value={answer.rating} max={field.scaleMax ?? max} readOnly />
    case "yesNo":
      return (
        <p className="text-sm">
          {answer.boolValue == null ? "—" : answer.boolValue ? "Yes" : "No"}
        </p>
      )
    case "checkbox":
      return (
        <p className="text-sm">
          {answer.choices && answer.choices.length > 0
            ? answer.choices.join(", ")
            : "—"}
        </p>
      )
    case "radio":
      return <p className="text-sm">{answer.choice || "—"}</p>
    case "date":
      return <p className="text-sm">{answer.date || "—"}</p>
    case "file":
      return (
        <div className="flex flex-col gap-1">
          {answer.files.length === 0 ? (
            <span className="text-muted-foreground text-sm">No files.</span>
          ) : (
            answer.files.map((f) => (
              <a
                key={f.storageId}
                href={f.url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="text-primary flex items-center gap-1 text-sm hover:underline"
              >
                <IconPaperclip className="size-3.5" /> Attachment
              </a>
            ))
          )}
        </div>
      )
    case "signature":
      return answer.signatureUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={answer.signatureUrl} alt="Signature" className="h-16" />
      ) : (
        <p className="text-muted-foreground text-sm">Not signed.</p>
      )
    default:
      return (
        <p className="text-sm whitespace-pre-wrap">
          {answer.text || <span className="text-muted-foreground">No answer.</span>}
        </p>
      )
  }
}

// ─── Editable answer input ───────────────────────────────────────────────────

function AnswerInput({
  reviewId,
  field,
  side,
  answer,
  max,
}: {
  reviewId: Id<"reviews">
  field: FormField
  side: "self" | "appraiser"
  answer: Answer | undefined
  max: number
}) {
  const save = useMutation(api.reviews.saveFieldAnswer)
  const genUrl = useMutation(api.reviews.generateUploadUrl)
  const [sigOpen, setSigOpen] = React.useState(false)
  const [text, setText] = React.useState(answer?.text ?? "")
  const [dateVal, setDateVal] = React.useState(answer?.date ?? "")

  React.useEffect(() => setText(answer?.text ?? ""), [answer?.text])
  React.useEffect(() => setDateVal(answer?.date ?? ""), [answer?.date])

  function persist(value: Record<string, unknown>) {
    save({ reviewId, fieldId: field.id, side, value }).catch((e) =>
      toast.error(e instanceof Error ? e.message : "Couldn't save."),
    )
  }

  switch (field.type) {
    case "shortText":
      return (
        <Input
          value={text}
          placeholder="Your answer…"
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text !== (answer?.text ?? "") && persist({ text })}
        />
      )
    case "longText":
      return (
        <Textarea
          value={text}
          rows={3}
          placeholder="Your answer…"
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text !== (answer?.text ?? "") && persist({ text })}
        />
      )
    case "ratingScale":
      return (
        <RatingInput
          value={answer?.rating ?? null}
          max={field.scaleMax ?? max}
          onChange={(v) => persist({ rating: v })}
        />
      )
    case "yesNo":
      return (
        <div className="flex gap-2">
          {[true, false].map((b) => (
            <Button
              key={String(b)}
              type="button"
              size="sm"
              variant={answer?.boolValue === b ? "default" : "outline"}
              onClick={() => persist({ boolValue: b })}
            >
              {b ? "Yes" : "No"}
            </Button>
          ))}
        </div>
      )
    case "radio":
      return (
        <div className="flex flex-wrap gap-2">
          {(field.options ?? []).map((opt) => (
            <Button
              key={opt}
              type="button"
              size="sm"
              variant={answer?.choice === opt ? "default" : "outline"}
              onClick={() => persist({ choice: opt })}
            >
              {opt}
            </Button>
          ))}
        </div>
      )
    case "checkbox": {
      const selected = new Set(answer?.choices ?? [])
      return (
        <div className="flex flex-col gap-1.5">
          {(field.options ?? []).map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={selected.has(opt)}
                onCheckedChange={() => {
                  const next = new Set(selected)
                  if (next.has(opt)) next.delete(opt)
                  else next.add(opt)
                  persist({ choices: [...next] })
                }}
              />
              {opt}
            </label>
          ))}
        </div>
      )
    }
    case "date":
      return (
        <Input
          type="date"
          value={dateVal}
          className="w-48"
          onChange={(e) => {
            setDateVal(e.target.value)
            persist({ date: e.target.value })
          }}
        />
      )
    case "file": {
      const existing = (answer?.files ?? []).map((f) => f.storageId)
      async function upload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        e.target.value = ""
        if (!file) return
        try {
          const url = await genUrl({ reviewId })
          const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": file.type },
            body: file,
          })
          const { storageId } = (await res.json()) as { storageId: string }
          persist({
            fileStorageIds: [...existing, storageId as Id<"_storage">],
          })
        } catch {
          toast.error("Upload failed.")
        }
      }
      return (
        <div className="flex flex-col gap-1.5">
          {(answer?.files ?? []).map((f) => (
            <div key={f.storageId} className="flex items-center gap-2 text-sm">
              <a
                href={f.url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="text-primary flex items-center gap-1 hover:underline"
              >
                <IconPaperclip className="size-3.5" /> Attachment
              </a>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() =>
                  persist({
                    fileStorageIds: existing.filter((id) => id !== f.storageId),
                  })
                }
                aria-label="Remove file"
              >
                <IconTrash className="size-3.5" />
              </Button>
            </div>
          ))}
          <Input type="file" onChange={upload} className="max-w-xs" />
        </div>
      )
    }
    case "signature":
      return (
        <div className="flex items-center gap-3">
          {answer?.signatureUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={answer.signatureUrl} alt="Signature" className="h-14" />
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => setSigOpen(true)}>
            {answer?.signatureUrl ? "Re-sign" : "Sign"}
          </Button>
          <SignatureCaptureDialog
            open={sigOpen}
            onOpenChange={setSigOpen}
            getUploadUrl={() => genUrl({ reviewId })}
            onSigned={async (storageId) => {
              await save({
                reviewId,
                fieldId: field.id,
                side,
                value: { signatureStorageId: storageId as Id<"_storage"> },
              })
            }}
          />
        </div>
      )
    default:
      return null
  }
}

// ─── One generic field ───────────────────────────────────────────────────────

function FieldBlock({
  reviewId,
  field,
  data,
  perspective,
}: {
  reviewId: Id<"reviews">
  field: FormField
  data: FormData
  perspective: Perspective
}) {
  const max = data.ratingScaleMax
  const mine: "self" | "appraiser" =
    perspective === "employee" ? "self" : "appraiser"
  const myAnswer = data.answers.find(
    (a) => a.fieldId === field.id && a.side === mine,
  )
  const selfAnswer = data.answers.find(
    (a) => a.fieldId === field.id && a.side === "self",
  )
  const canEditMine =
    sideIncludes(field.side, mine) &&
    (mine === "self" ? data.canSelf : data.canAppraiser)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <p className="text-sm font-medium">
          {field.label}
          {field.required && <span className="text-destructive"> *</span>}
        </p>
      </div>
      {field.description && (
        <p className="text-muted-foreground text-xs">{field.description}</p>
      )}

      {/* Appraiser sees the employee's answer for self/both fields. */}
      {perspective === "appraiser" && sideIncludes(field.side, "self") && (
        <div className="bg-muted/40 rounded-md border p-2">
          <p className="text-muted-foreground mb-1 text-xs">Employee</p>
          <ReadAnswer field={field} answer={selfAnswer} max={max} />
        </div>
      )}

      {/* The current side's input (or read-only if closed / not theirs). */}
      {sideIncludes(field.side, mine) ? (
        <div className={cn(perspective === "appraiser" && "rounded-md border p-2")}>
          {perspective === "appraiser" && (
            <p className="text-muted-foreground mb-1 text-xs">Appraiser</p>
          )}
          {canEditMine ? (
            <AnswerInput
              reviewId={reviewId}
              field={field}
              side={mine}
              answer={myAnswer}
              max={max}
            />
          ) : (
            <ReadAnswer field={field} answer={myAnswer} max={max} />
          )}
        </div>
      ) : (
        // Employee-only field viewed by appraiser with no appraiser side — the
        // read-only employee answer above already covers it.
        perspective === "employee" && (
          <ReadAnswer field={field} answer={myAnswer} max={max} />
        )
      )}
    </div>
  )
}

// ─── Objectives block ────────────────────────────────────────────────────────

function ObjectivesBlock({
  reviewId,
  field,
  data,
  perspective,
  objectives,
}: {
  reviewId: Id<"reviews">
  field: FormField
  data: FormData
  perspective: Perspective
  objectives: Objective[] | undefined
}) {
  const rate = useMutation(api.reviewObjectives.rate)
  const add = useMutation(api.reviewObjectives.add)
  const remove = useMutation(api.reviewObjectives.remove)
  const [title, setTitle] = React.useState("")
  const [weight, setWeight] = React.useState("")
  const mine: "self" | "appraiser" =
    perspective === "employee" ? "self" : "appraiser"
  const canEdit = mine === "self" ? data.canSelf : data.canAppraiser
  const max = data.ratingScaleMax

  if (objectives === undefined) return <Skeleton className="h-24 w-full" />

  return (
    <div className="flex flex-col gap-3">
      {field.weightPct != null && field.weightPct > 0 && (
        <p className="text-muted-foreground text-xs">
          Objectives carry {field.weightPct}% of the score.
        </p>
      )}
      {objectives.length === 0 && (
        <p className="text-muted-foreground text-sm">No objectives yet.</p>
      )}
      {objectives.map((o) => (
        <div key={o._id} className="rounded-md border p-3">
          <div className="flex items-center justify-between">
            <span className="font-medium">{o.title}</span>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{o.weight}%</Badge>
              {canEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() =>
                    remove({ objectiveId: o._id }).catch((e) =>
                      toast.error(e instanceof Error ? e.message : "Failed"),
                    )
                  }
                  aria-label="Remove objective"
                >
                  <IconTrash className="size-3.5" />
                </Button>
              )}
            </div>
          </div>
          <RateRow
            perspective={perspective}
            selfRating={o.selfRating}
            selfComment={o.selfComment}
            appraiserRating={o.appraiserRating}
            appraiserComment={o.appraiserComment}
            max={max}
            canEdit={canEdit}
            onRate={(rating) =>
              rate({ objectiveId: o._id, side: mine, rating })
            }
            onComment={(comment) =>
              rate({ objectiveId: o._id, side: mine, comment })
            }
          />
        </div>
      ))}
      {canEdit && (
        <div className="flex flex-wrap items-end gap-2">
          <Input
            value={title}
            placeholder="New objective"
            onChange={(e) => setTitle(e.target.value)}
            className="h-9 flex-1"
          />
          <Input
            value={weight}
            inputMode="numeric"
            placeholder="Weight %"
            onChange={(e) => setWeight(e.target.value)}
            className="h-9 w-24"
          />
          <Button
            type="button"
            size="sm"
            onClick={async () => {
              if (!title.trim()) return
              await add({
                reviewId,
                title: title.trim(),
                weight: Number(weight) || 0,
              })
              setTitle("")
              setWeight("")
            }}
          >
            <IconPlus className="size-3.5" /> Add
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Competencies block ──────────────────────────────────────────────────────

function CompetenciesBlock({
  data,
  perspective,
  competencies,
}: {
  data: FormData
  perspective: Perspective
  competencies: Competency[] | undefined
}) {
  const rate = useMutation(api.reviewCompetencies.rate)
  const mine: "self" | "appraiser" =
    perspective === "employee" ? "self" : "appraiser"
  const canEdit = mine === "self" ? data.canSelf : data.canAppraiser
  const max = data.ratingScaleMax

  if (competencies === undefined) return <Skeleton className="h-24 w-full" />
  if (competencies.length === 0)
    return <p className="text-muted-foreground text-sm">No competencies configured.</p>

  return (
    <div className="flex flex-col gap-3">
      {competencies.map((c) => (
        <div key={c._id} className="rounded-md border p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-primary text-xs font-medium">{c.category}</p>
              <span className="font-medium">{c.name}</span>
            </div>
            {c.weightPct > 0 && <Badge variant="outline">{c.weightPct}%</Badge>}
          </div>
          {c.description && (
            <p className="text-muted-foreground mt-1 text-xs">{c.description}</p>
          )}
          <RateRow
            perspective={perspective}
            selfRating={c.selfRating}
            selfComment={c.selfComment}
            appraiserRating={c.appraiserRating}
            appraiserComment={c.appraiserComment}
            max={max}
            canEdit={canEdit}
            onRate={(rating) =>
              rate({ competencyId: c._id, side: mine, rating })
            }
            onComment={(comment) =>
              rate({ competencyId: c._id, side: mine, comment })
            }
          />
        </div>
      ))}
    </div>
  )
}

function RateRow({
  perspective,
  selfRating,
  selfComment,
  appraiserRating,
  appraiserComment,
  max,
  canEdit,
  onRate,
  onComment,
}: {
  perspective: Perspective
  selfRating: number | null
  selfComment: string | null
  appraiserRating: number | null
  appraiserComment: string | null
  max: number
  canEdit: boolean
  onRate: (rating: number) => Promise<unknown>
  onComment: (comment: string) => Promise<unknown>
}) {
  const mineRating = perspective === "employee" ? selfRating : appraiserRating
  const mineComment = perspective === "employee" ? selfComment : appraiserComment
  const [draft, setDraft] = React.useState(mineComment ?? "")
  React.useEffect(() => setDraft(mineComment ?? ""), [mineComment])

  return (
    <div className="mt-2 grid gap-2 md:grid-cols-2">
      {perspective === "appraiser" && (
        <div className="bg-muted/40 rounded-md p-2">
          <p className="text-muted-foreground text-xs">Employee</p>
          <RatingInput value={selfRating} max={max} readOnly />
          {selfComment && <p className="text-sm">{selfComment}</p>}
        </div>
      )}
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs">
          {perspective === "employee" ? "Your rating" : "Appraiser"}
        </p>
        <RatingInput
          value={mineRating}
          max={max}
          readOnly={!canEdit}
          onChange={(v) =>
            onRate(v).catch(() => toast.error("Couldn't save rating."))
          }
        />
        {canEdit ? (
          <Textarea
            value={draft}
            rows={2}
            placeholder="Comment…"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() =>
              draft !== (mineComment ?? "") &&
              onComment(draft).catch(() => toast.error("Couldn't save."))
            }
          />
        ) : (
          mineComment && <p className="text-sm">{mineComment}</p>
        )}
      </div>
    </div>
  )
}

// ─── Root ────────────────────────────────────────────────────────────────────

export function AppraisalFill({
  reviewId,
  perspective: perspectiveProp,
}: {
  reviewId: Id<"reviews">
  /** Omit to derive from the viewer (subject → employee, else appraiser). */
  perspective?: Perspective
}) {
  const data = useQuery(api.reviews.getAppraisalForm, { reviewId })
  const objectives = useQuery(api.reviewObjectives.forReview, { reviewId })
  const competencies = useQuery(api.reviewCompetencies.forReview, { reviewId })
  const ensureComps = useMutation(api.reviewCompetencies.ensureForReview)
  const submitSelf = useMutation(api.reviews.submitSelfAppraisal)
  const submitAppraiser = useMutation(api.reviews.submitAppraiserAppraisal)
  const acknowledge = useMutation(api.reviews.acknowledgeAppraisal)

  // Seed competency lines once if the form has a competencies block.
  const seeded = React.useRef(false)
  const hasCompetencyBlock = !!data?.form.sections
    .flatMap((s) => s.fields)
    .some((f) => f.type === "competencies")
  React.useEffect(() => {
    if (
      !seeded.current &&
      hasCompetencyBlock &&
      competencies &&
      competencies.length === 0 &&
      (data?.canSelf || data?.canAppraiser)
    ) {
      seeded.current = true
      ensureComps({ reviewId }).catch(() => {})
    }
  }, [hasCompetencyBlock, competencies, data, ensureComps, reviewId])

  if (data === undefined) return <Skeleton className="h-96 w-full" />

  const perspective: Perspective =
    perspectiveProp ?? (data.viewerIsSubject ? "employee" : "appraiser")

  const mineSubmitted =
    perspective === "employee" ? data.selfSubmittedAt : data.managerSubmittedAt

  async function act(p: Promise<unknown>, ok: string) {
    try {
      await p
      toast.success(ok)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed")
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {data.form.sections.map((section) => {
        // Hide sections with nothing visible to this perspective.
        const visible = section.fields.filter(
          (f) =>
            perspective === "appraiser" || sideIncludes(f.side, "self"),
        )
        if (visible.length === 0) return null
        return (
          <Card key={section.id}>
            <CardContent className="flex flex-col gap-5 pt-6">
              <div>
                <h3 className="text-base font-semibold">{section.title}</h3>
                {section.description && (
                  <p className="text-muted-foreground text-sm">
                    {section.description}
                  </p>
                )}
              </div>
              {visible.map((field) =>
                field.type === "objectives" ? (
                  <ObjectivesBlock
                    key={field.id}
                    reviewId={reviewId}
                    field={field}
                    data={data}
                    perspective={perspective}
                    objectives={objectives}
                  />
                ) : field.type === "competencies" ? (
                  <CompetenciesBlock
                    key={field.id}
                    data={data}
                    perspective={perspective}
                    competencies={competencies}
                  />
                ) : (
                  <FieldBlock
                    key={field.id}
                    reviewId={reviewId}
                    field={field}
                    data={data}
                    perspective={perspective}
                  />
                ),
              )}
            </CardContent>
          </Card>
        )
      })}

      <div className="flex flex-wrap items-center gap-3">
        {perspective === "employee" && data.canSelf && (
          <Button
            onClick={() =>
              act(submitSelf({ reviewId }), "Self-appraisal submitted.")
            }
          >
            Submit self-appraisal
          </Button>
        )}
        {perspective === "appraiser" && (
          <Button
            disabled={!data.canFinalizeAppraiser}
            title={
              data.canAppraiser && !data.canFinalizeAppraiser
                ? "Waiting for the employee to submit their self-appraisal."
                : undefined
            }
            onClick={() =>
              act(submitAppraiser({ reviewId }), "Appraisal completed.")
            }
          >
            Complete appraisal
          </Button>
        )}
        {perspective === "employee" && data.canAcknowledge && (
          <Button
            variant="outline"
            onClick={() =>
              act(acknowledge({ reviewId }), "Appraisal acknowledged.")
            }
          >
            Acknowledge
          </Button>
        )}
        {mineSubmitted && (
          <span className="text-muted-foreground text-sm">
            {perspective === "employee"
              ? "Your self-appraisal is submitted."
              : "Appraisal completed."}
          </span>
        )}
        {perspective === "appraiser" &&
          data.canAppraiser &&
          !data.selfSubmittedAt && (
            <span className="text-muted-foreground text-sm">
              You can fill in parallel; finalize once the employee submits.
            </span>
          )}
      </div>
    </div>
  )
}
