import { PageHeader } from "@/components/shared/page-header"
import { TeamAttendance } from "@/features/attendance/components/team-attendance"

export default function TeamAttendancePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Team attendance"
        description="See who's clocked in and review correction requests."
      />
      <TeamAttendance />
    </div>
  )
}
