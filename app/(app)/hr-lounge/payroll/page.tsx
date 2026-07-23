import { Suspense } from "react"
import { PageHeader } from "@/components/shared/page-header"
import { PayrollWorkspaceTabs } from "@/features/payroll/components/payroll-workspace-tabs"

export default function PayrollPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payroll"
        description="Run monthly payroll, review payslips and manage payroll settings."
      />
      <Suspense>
        <PayrollWorkspaceTabs />
      </Suspense>
    </div>
  )
}
