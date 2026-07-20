import type { Id } from "@/convex/_generated/dataModel"
import { CustomReportBuilder } from "@/features/reports/components/custom-report-builder"

export default async function CustomReportBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const reportId = id === "new" ? null : (id as Id<"customReports">)
  return <CustomReportBuilder reportId={reportId} />
}
