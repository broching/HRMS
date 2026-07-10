import { PageHeader } from "@/components/shared/page-header"
import { PayrollApprovalsInbox } from "@/features/payroll/components/payroll-approvals-inbox"

export default function PayrollApprovalsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payslip approvals"
        description="Review, sign and approve the payslips assigned to you before payroll is released."
      />
      <PayrollApprovalsInbox />
    </div>
  )
}
