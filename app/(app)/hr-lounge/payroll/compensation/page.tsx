import { PageHeader } from "@/components/shared/page-header"
import { CompensationManagement } from "@/features/payroll/components/compensation-management"

export default function CompensationPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Compensation"
        description="Set effective-dated salaries and allowances per employee."
      />
      <CompensationManagement />
    </div>
  )
}
