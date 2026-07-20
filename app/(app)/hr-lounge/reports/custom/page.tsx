import { PageHeader } from "@/components/shared/page-header"
import { ReportsTabs } from "@/features/reports/components/reports-tabs"
import { CustomReportsList } from "@/features/reports/components/custom-reports-list"

export default function CustomReportsPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Reports"
        description="Workforce statistics and custom report builder."
      />
      <ReportsTabs />
      <CustomReportsList />
    </div>
  )
}
