import { PageHeader } from "@/components/shared/page-header"
import { MyPayslips } from "@/features/payroll/components/my-payslips"

export default function PayslipsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payroll"
        description="View and download your payslips."
      />
      <MyPayslips />
    </div>
  )
}
