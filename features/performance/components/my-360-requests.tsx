"use client"

import { getErrorMessage } from "@/lib/errors"
import * as React from "react"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import type { FunctionReturnType } from "convex/server"
import { api } from "@/convex/_generated/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { RatingInput } from "@/features/performance/components/rating-input"

type QueueRow = FunctionReturnType<typeof api.feedback360.myAssignments>[number]

const MAX = 5

export function My360Requests() {
  const requests = useQuery(api.feedback360.myAssignments)

  if (requests === undefined) {
    return (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }
  if (requests.length === 0) return null

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <div>
        <h2 className="text-lg font-semibold">360 feedback requests</h2>
        <p className="text-muted-foreground text-sm">
          Give anonymous feedback for colleagues. Only HR and their manager can
          see the results.
        </p>
      </div>
      {requests.map((r) => (
        <RequestCard key={r._id} request={r} />
      ))}
    </div>
  )
}

function RequestCard({ request }: { request: QueueRow }) {
  const submit = useMutation(api.feedback360.submit)
  const [answers, setAnswers] = React.useState(
    request.questions.map((q, i) => ({
      question: q,
      rating: request.answers[i]?.rating,
      comment: request.answers[i]?.comment ?? "",
    })),
  )
  const [saving, setSaving] = React.useState(false)

  function setRating(i: number, rating: number) {
    setAnswers((prev) =>
      prev.map((a, idx) => (idx === i ? { ...a, rating } : a)),
    )
  }
  function setComment(i: number, comment: string) {
    setAnswers((prev) =>
      prev.map((a, idx) => (idx === i ? { ...a, comment } : a)),
    )
  }

  async function handleSubmit() {
    setSaving(true)
    try {
      await submit({
        assignmentId: request._id,
        answers: answers.map((a) => ({
          question: a.question,
          rating: a.rating,
          comment: a.comment.trim() || undefined,
        })),
      })
      toast.success("Feedback submitted. Thank you!")
    } catch (e) {
      toast.error(getErrorMessage(e, "Could not submit."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            Feedback for {request.subjectName}
          </CardTitle>
          {request.status === "submitted" ? (
            <Badge>Submitted</Badge>
          ) : (
            <Badge variant="secondary">Pending</Badge>
          )}
        </div>
        <CardDescription>{request.cycleName}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {answers.map((a, i) => (
          <div key={i} className="flex flex-col gap-2">
            <p className="text-sm font-medium">{a.question}</p>
            <RatingInput
              value={a.rating ?? null}
              max={MAX}
              onChange={(v) => setRating(i, v)}
            />
            <Textarea
              rows={2}
              placeholder="Add a comment (optional)"
              value={a.comment}
              onChange={(e) => setComment(i, e.target.value)}
            />
          </div>
        ))}
        <div>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving
              ? "Submitting…"
              : request.status === "submitted"
                ? "Update feedback"
                : "Submit feedback"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
