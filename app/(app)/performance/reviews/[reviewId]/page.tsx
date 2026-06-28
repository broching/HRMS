import { ReviewDetail } from "@/features/performance/components/review-detail"
import type { Id } from "@/convex/_generated/dataModel"

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ reviewId: string }>
}) {
  const { reviewId } = await params
  return <ReviewDetail reviewId={reviewId as Id<"reviews">} />
}
