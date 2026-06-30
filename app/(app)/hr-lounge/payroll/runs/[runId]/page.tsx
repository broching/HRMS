import { RunWizard } from "@/features/payroll/components/run-wizard"
import type { Id } from "@/convex/_generated/dataModel"

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>
}) {
  const { runId } = await params
  return <RunWizard runId={runId as Id<"payrollRuns">} />
}
