import { PageHeader } from "@/components/shared/page-header"
import { TeamPerformance } from "@/features/performance/components/team-performance"

export default function TeamPerformancePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Team reviews"
        description="Complete reviews for your team."
      />
      <TeamPerformance />
    </div>
  )
}
