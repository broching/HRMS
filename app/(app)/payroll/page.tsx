import { PageHeader } from "@/components/shared/page-header"
import { PayrollRuns } from "@/features/payroll/components/payroll-runs"

export default function PayrollPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payroll"
        description="Run monthly payroll and review payslips."
      />
      <PayrollRuns />
    </div>
  )
}
