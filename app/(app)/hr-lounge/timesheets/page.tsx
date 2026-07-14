import { PageHeader } from "@/components/shared/page-header"
import { RoleGate } from "@/components/shared/role-gate"
import { TeamTimesheets } from "@/features/timesheets/components/team-timesheets"

export default function TimesheetReportPage() {
  return (
    <RoleGate permission="projects:manage">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Timesheets"
          description="Time logged across the whole organisation."
        />
        <TeamTimesheets scope="org" />
      </div>
    </RoleGate>
  )
}
