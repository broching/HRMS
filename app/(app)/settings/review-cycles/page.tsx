import { PageHeader } from "@/components/shared/page-header"
import { ReviewCyclesSettings } from "@/features/performance/components/review-cycles-settings"

export default function ReviewCyclesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Review cycles"
        description="Create appraisal cycles and open them to employees."
      />
      <ReviewCyclesSettings />
    </div>
  )
}
