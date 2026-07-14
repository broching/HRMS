import { PageHeader } from "@/components/shared/page-header"
import { RoleGate } from "@/components/shared/role-gate"
import { TeamTimesheets } from "@/features/timesheets/components/team-timesheets"

export default function TeamTimesheetsPage() {
  return (
    <RoleGate permission="timesheets:team">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Team Timesheets"
          description="Time logged across your whole reporting line."
        />
        <TeamTimesheets />
      </div>
    </RoleGate>
  )
}
