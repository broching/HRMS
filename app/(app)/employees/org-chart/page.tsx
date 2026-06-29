import { PageHeader } from "@/components/shared/page-header"
import { OrgChart } from "@/features/employees/components/org-chart"

export default function OrgChartPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Org chart"
        description="Your reporting structure."
      />
      <OrgChart />
    </div>
  )
}
