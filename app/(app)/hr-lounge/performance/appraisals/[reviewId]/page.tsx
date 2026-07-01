import { AppraisalDetail } from "@/features/performance/components/appraisal-detail"
import type { Id } from "@/convex/_generated/dataModel"

export default async function AppraisalDetailPage({
  params,
}: {
  params: Promise<{ reviewId: string }>
}) {
  const { reviewId } = await params
  return <AppraisalDetail reviewId={reviewId as Id<"reviews">} />
}
