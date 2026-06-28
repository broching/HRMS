import { PageHeader } from "@/components/shared/page-header"
import { LeaveCalendar } from "@/features/leave/components/leave-calendar"

export default function LeaveCalendarPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Team calendar"
        description="Approved leave and public holidays across the organization."
      />
      <LeaveCalendar />
    </div>
  )
}
