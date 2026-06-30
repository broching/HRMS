import { PublicJob } from "@/features/recruitment/components/public-job"
import type { Id } from "@/convex/_generated/dataModel"

export default async function BoardJobPage({
  params,
}: {
  params: Promise<{ slug: string; jobId: string }>
}) {
  const { slug, jobId } = await params
  return <PublicJob slug={slug} jobId={jobId as Id<"jobs">} />
}
