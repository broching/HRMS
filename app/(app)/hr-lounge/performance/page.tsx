import { PageHeader } from "@/components/shared/page-header"
import { PerformanceTabs } from "@/features/performance/components/performance-tabs"
import { HrPerformanceDashboard } from "@/features/performance/components/hr-dashboard"

export default function PerformanceDashboardPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Performance"
        description="Appraisal cycles, competencies and 360 feedback."
      />
      <PerformanceTabs />
      <HrPerformanceDashboard />
    </div>
  )
}
