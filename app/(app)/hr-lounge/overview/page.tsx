import { PageHeader } from "@/components/shared/page-header"
import { AdminDashboard } from "@/features/dashboard/components/admin-dashboard"

export default function HrLoungeOverviewPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Overview"
        description="Org-wide headcount, leave and approvals at a glance."
      />
      <AdminDashboard />
    </div>
  )
}
