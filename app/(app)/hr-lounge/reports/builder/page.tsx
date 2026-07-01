import { PageHeader } from "@/components/shared/page-header"
import { ReportsTabs } from "@/features/reports/components/reports-tabs"
import { ReportBuilderGrid } from "@/features/reports/components/report-builder-grid"

export default function ReportBuilderPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Reports"
        description="Workforce statistics and custom report builder."
      />
      <ReportsTabs />
      <ReportBuilderGrid />
    </div>
  )
}
