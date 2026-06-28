import { ClaimDetail } from "@/features/claims/components/claim-detail"
import type { Id } from "@/convex/_generated/dataModel"

export default async function ClaimDetailPage({
  params,
}: {
  params: Promise<{ claimId: string }>
}) {
  const { claimId } = await params
  return <ClaimDetail claimId={claimId as Id<"claims">} />
}
