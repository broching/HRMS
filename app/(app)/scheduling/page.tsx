import { PageHeader } from "@/components/shared/page-header"
import { MyShifts } from "@/features/scheduling/components/my-shifts"

export default function SchedulingPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My schedule"
        description="Your upcoming published shifts."
      />
      <MyShifts />
    </div>
  )
}
