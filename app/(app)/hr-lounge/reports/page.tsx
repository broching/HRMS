import { PageHeader } from "@/components/shared/page-header"
import { ReportsTabs } from "@/features/reports/components/reports-tabs"
import { StatisticsView } from "@/features/reports/components/statistics-view"

export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Reports"
        description="Workforce statistics and custom report builder."
      />
      <ReportsTabs />
      <StatisticsView />
    </div>
  )
}
