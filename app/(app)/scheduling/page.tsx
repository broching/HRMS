import { PageHeader } from "@/components/shared/page-header"
import { MySchedule } from "@/features/scheduling/components/my-schedule"

export default function SchedulingPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My schedule"
        description="Your upcoming shifts, working hours and overtime."
      />
      <MySchedule />
    </div>
  )
}
