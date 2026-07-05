import { PageHeader } from "@/components/shared/page-header"
import { RoleGate } from "@/components/shared/role-gate"
import { TeamPerformance } from "@/features/performance/components/team-performance"

export default function TeamPerformancePage() {
  return (
    <RoleGate permission="performance:team">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Team reviews"
          description="Complete reviews for your team."
        />
        <TeamPerformance />
      </div>
    </RoleGate>
  )
}
