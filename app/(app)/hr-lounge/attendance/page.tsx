import { PageHeader } from "@/components/shared/page-header"
import { RoleGate } from "@/components/shared/role-gate"
import { AttendanceTabs } from "@/features/attendance/components/attendance-tabs"
import { TeamAttendance } from "@/features/attendance/components/team-attendance"

export default function HrAttendancePage() {
  return (
    <RoleGate permission="attendance:config">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Attendance"
          description="Clock-ins across the organisation, and correction requests."
        />
        <AttendanceTabs />
        <TeamAttendance scope="org" />
      </div>
    </RoleGate>
  )
}
