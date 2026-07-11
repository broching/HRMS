import { PageHeader } from "@/components/shared/page-header"
import { CompensationTabs } from "@/features/payroll/components/compensation-tabs"

export default function CompensationPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Compensation"
        description="Salaries, allowances, CPF rates and statutory funds."
      />
      <CompensationTabs />
    </div>
  )
}
