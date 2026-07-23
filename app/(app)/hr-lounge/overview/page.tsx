import { PageHeader } from "@/components/shared/page-header"
import { HrOverview } from "@/features/dashboard/components/hr-overview"

export default function HrLoungeOverviewPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Overview" />
      <HrOverview />
    </div>
  )
}
