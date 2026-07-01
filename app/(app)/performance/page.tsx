import { PageHeader } from "@/components/shared/page-header"
import { MyReviews } from "@/features/performance/components/my-reviews"
import { GoalsList } from "@/features/performance/components/goals-list"
import { My360Requests } from "@/features/performance/components/my-360-requests"
import { DevelopmentPlan } from "@/features/performance/components/development-plan"

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
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Development Plan</h2>
        <DevelopmentPlan />
      </section>
    </div>
  )
}
