import { PageHeader } from "@/components/shared/page-header"
import { MyReviews } from "@/features/performance/components/my-reviews"
import { GoalsList } from "@/features/performance/components/goals-list"
import { My360Requests } from "@/features/performance/components/my-360-requests"

export default function PerformancePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Performance"
        description="Your goals and review cycles."
      />
      <GoalsList title="My goals" />
      <MyReviews />
      <My360Requests />
    </div>
  )
}
