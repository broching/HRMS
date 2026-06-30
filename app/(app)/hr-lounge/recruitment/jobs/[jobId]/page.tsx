import { JobPipeline } from "@/features/recruitment/components/job-pipeline"
import type { Id } from "@/convex/_generated/dataModel"

export default async function JobPipelinePage({
  params,
}: {
  params: Promise<{ jobId: string }>
}) {
  const { jobId } = await params
  return <JobPipeline jobId={jobId as Id<"jobs">} />
}
