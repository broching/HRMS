import { RoleGate } from "@/components/shared/role-gate"
import { TimesheetReport } from "@/features/timesheets/components/timesheet-report"

export default function TimesheetReportPage() {
  return (
    <RoleGate permission="projects:manage">
      <TimesheetReport />
    </RoleGate>
  )
}
