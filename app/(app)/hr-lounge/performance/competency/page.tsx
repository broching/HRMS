import { PageHeader } from "@/components/shared/page-header"
import { PerformanceTabs } from "@/features/performance/components/performance-tabs"
import { CompetencySettings } from "@/features/performance/components/competency-settings"

export default function PerformanceCompetencyPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Performance"
        description="Appraisal cycles, competencies and 360 feedback."
      />
      <PerformanceTabs />
      <CompetencySettings />
    </div>
  )
}
