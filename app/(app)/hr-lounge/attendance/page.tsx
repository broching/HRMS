import { PageHeader } from "@/components/shared/page-header"
import { RoleGate } from "@/components/shared/role-gate"
import { HrLoungeShell } from "@/features/hr-lounge/components/hr-lounge-shell"
import { TeamAttendance } from "@/features/attendance/components/team-attendance"

export default function HrAttendancePage() {
  return (
    <HrLoungeShell>
      <RoleGate permission="attendance:config">
        <div className="flex flex-col gap-6">
          <PageHeader
            title="Attendance"
            description="Clock-ins across the organisation, and correction requests."
          />
          <TeamAttendance scope="org" />
        </div>
      </RoleGate>
    </HrLoungeShell>
  )
}
