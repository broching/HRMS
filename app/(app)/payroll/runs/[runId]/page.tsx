import { RunDetail } from "@/features/payroll/components/run-detail"
import type { Id } from "@/convex/_generated/dataModel"

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>
}) {
  const { runId } = await params
  return <RunDetail runId={runId as Id<"payrollRuns">} />
}
