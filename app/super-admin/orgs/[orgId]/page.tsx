import type { Metadata } from "next"
import { OrgDetail } from "@/features/super-admin/components/org-detail"
import type { Id } from "@/convex/_generated/dataModel"

export const metadata: Metadata = {
  title: "Organization — Platform Console",
  robots: { index: false, follow: false },
}

export default async function SuperAdminOrgPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const { orgId } = await params
  return <OrgDetail orgId={orgId as Id<"organizations">} />
}
