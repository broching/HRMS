import { PageHeader } from "@/components/shared/page-header"
import { PerformanceTabs } from "@/features/performance/components/performance-tabs"
import { ReportView } from "@/features/performance/components/report-view"
import type { Id } from "@/convex/_generated/dataModel"

export default async function PerformanceReportPage({
  searchParams,
}: {
  searchParams: Promise<{ cycleId?: string }>
}) {
  const { cycleId } = await searchParams
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Performance"
        description="Appraisal cycles, competencies and 360 feedback."
      />
      <PerformanceTabs />
      <ReportView cycleId={cycleId as Id<"reviewCycles"> | undefined} />
    </div>
  )
}
