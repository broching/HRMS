import { OfficeDetail } from "@/features/org-structure/components/office-detail"
import type { Id } from "@/convex/_generated/dataModel"

export default async function OfficeDetailPage({
  params,
}: {
  params: Promise<{ officeId: string }>
}) {
  const { officeId } = await params
  return <OfficeDetail officeId={officeId as Id<"offices">} />
}
