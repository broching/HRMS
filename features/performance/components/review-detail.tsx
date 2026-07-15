"use client"

import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/shared/page-header"
import { AppraisalFill } from "@/features/performance/components/appraisal-fill"
import {
  REVIEW_STATUS_BADGE,
  REVIEW_STATUS_LABELS,
} from "@/features/performance/lib/labels"

export function ReviewDetail({ reviewId }: { reviewId: Id<"reviews"> }) {
  const review = useQuery(api.reviews.get, { reviewId })

  if (review === undefined) {
    return (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${review.cycleName}`}
        description={
          review.managerName ? `Appraiser: ${review.managerName}` : undefined
        }
      >
        <Badge variant={REVIEW_STATUS_BADGE[review.status]}>
          {REVIEW_STATUS_LABELS[review.status]}
        </Badge>
      </PageHeader>

      <div className="px-4 lg:px-6">
        <AppraisalFill reviewId={reviewId} />
      </div>
    </div>
  )
}
