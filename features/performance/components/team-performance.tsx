"use client"

import Link from "next/link"
import { useQuery } from "convex/react"
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
import { Skeleton } from "@/components/ui/skeleton"
import { ratingLabel } from "@/features/performance/lib/labels"

export function TeamPerformance() {
  const queue = useQuery(api.reviews.managerQueue)

  return (
    <div className="px-4 lg:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Reviews to complete</CardTitle>
          <CardDescription>
            Self-reviews submitted by your team, awaiting your input.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {queue === undefined ? (
            <Skeleton className="h-20 w-full" />
          ) : queue.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing awaiting your review.
            </p>
          ) : (
            queue.map((r) => (
              <div
                key={r._id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div>
                  <div className="font-medium">{r.employeeName}</div>
                  <div className="text-muted-foreground text-sm">
                    {r.cycleName} · Self:{" "}
                    {ratingLabel(r.selfRating, r.ratingScaleMax)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">Needs review</Badge>
                  <Button asChild size="sm">
                    <Link href={`/performance/reviews/${r._id}`}>Complete</Link>
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
