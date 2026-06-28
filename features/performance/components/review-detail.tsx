"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/shared/page-header"
import { RatingInput } from "./rating-input"
import {
  REVIEW_STATUS_BADGE,
  REVIEW_STATUS_LABELS,
  ratingLabel,
} from "@/features/performance/lib/labels"

function SubmitSection({
  title,
  reviewId,
  max,
  onSubmit,
}: {
  title: string
  reviewId: Id<"reviews">
  max: number
  onSubmit: (args: {
    reviewId: Id<"reviews">
    rating: number
    comments: string
  }) => Promise<unknown>
}) {
  const [rating, setRating] = React.useState<number | null>(null)
  const [comments, setComments] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function go() {
    if (rating == null) {
      toast.error("Pick a rating.")
      return
    }
    setBusy(true)
    try {
      await onSubmit({ reviewId, rating, comments })
      toast.success("Submitted")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't submit")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Rating</Label>
          <RatingInput value={rating} max={max} onChange={setRating} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Comments</Label>
          <Textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={4}
            placeholder="Highlights, areas to grow, context…"
          />
        </div>
        <div>
          <Button onClick={go} disabled={busy}>
            Submit
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ReadSection({
  title,
  rating,
  max,
  comments,
}: {
  title: string
  rating: number | null
  max: number
  comments: string | null
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <RatingInput value={rating} max={max} readOnly />
        <p className="text-sm whitespace-pre-wrap">
          {comments || <span className="text-muted-foreground">No comments.</span>}
        </p>
      </CardContent>
    </Card>
  )
}

export function ReviewDetail({ reviewId }: { reviewId: Id<"reviews"> }) {
  const review = useQuery(api.reviews.get, { reviewId })
  const submitSelf = useMutation(api.reviews.submitSelf)
  const submitManager = useMutation(api.reviews.submitManager)

  if (review === undefined) {
    return (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const max = review.ratingScaleMax

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${review.employeeName} · ${review.cycleName}`}
        description={
          review.managerName ? `Manager: ${review.managerName}` : undefined
        }
      >
        <Badge variant={REVIEW_STATUS_BADGE[review.status]}>
          {REVIEW_STATUS_LABELS[review.status]}
        </Badge>
      </PageHeader>

      <div className="grid gap-4 px-4 lg:grid-cols-2 lg:px-6">
        {/* Self-review */}
        {review.canSelf ? (
          <SubmitSection
            title="Your self-review"
            reviewId={reviewId}
            max={max}
            onSubmit={submitSelf}
          />
        ) : (
          <ReadSection
            title="Self-review"
            rating={review.selfRating}
            max={max}
            comments={review.selfComments}
          />
        )}

        {/* Manager review */}
        {review.canManager ? (
          <SubmitSection
            title="Manager review"
            reviewId={reviewId}
            max={max}
            onSubmit={submitManager}
          />
        ) : review.status === "self_review" ? (
          <Card>
            <CardHeader>
              <CardTitle>Manager review</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Available once the self-review is submitted.
              </p>
            </CardContent>
          </Card>
        ) : (
          <ReadSection
            title="Manager review"
            rating={review.managerRating}
            max={max}
            comments={review.managerComments}
          />
        )}
      </div>

      {review.status === "completed" && (
        <div className="px-4 lg:px-6">
          <Card>
            <CardHeader>
              <CardTitle>Overall</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">
                {ratingLabel(review.overallRating, max)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
