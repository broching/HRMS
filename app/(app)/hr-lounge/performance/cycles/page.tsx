import { PageHeader } from "@/components/shared/page-header"
import { PerformanceTabs } from "@/features/performance/components/performance-tabs"
import { ReviewCyclesSettings } from "@/features/performance/components/review-cycles-settings"

export default function PerformanceCyclesPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Performance"
        description="Appraisal cycles, competencies and 360 feedback."
      />
      <PerformanceTabs />
      <ReviewCyclesSettings />
    </div>
  )
}
