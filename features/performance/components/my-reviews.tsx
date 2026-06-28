"use client"

import Link from "next/link"
import { useQuery } from "convex/react"
import { api } from "@/convex/_generated/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  REVIEW_STATUS_BADGE,
  REVIEW_STATUS_LABELS,
  ratingLabel,
} from "@/features/performance/lib/labels"

export function MyReviews() {
  const reviews = useQuery(api.reviews.mine)

  return (
    <Card className="mx-4 lg:mx-6">
      <CardHeader>
        <CardTitle>My reviews</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {reviews === undefined ? (
          <Skeleton className="h-20 w-full" />
        ) : reviews.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No reviews yet. They appear here when a review cycle opens.
          </p>
        ) : (
          reviews.map((r) => (
            <div
              key={r._id}
              className="flex items-center justify-between rounded-md border p-3"
            >
              <div>
                <div className="font-medium">{r.cycleName}</div>
                <div className="text-muted-foreground text-sm">
                  Overall: {ratingLabel(r.overallRating, r.ratingScaleMax)}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={REVIEW_STATUS_BADGE[r.status]}>
                  {REVIEW_STATUS_LABELS[r.status]}
                </Badge>
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/performance/reviews/${r._id}`}>
                    {r.status === "self_review" ? "Start" : "View"}
                  </Link>
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
