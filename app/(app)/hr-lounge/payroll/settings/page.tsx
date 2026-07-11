import Link from "next/link"
import { IconArrowLeft } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/shared/page-header"
import { PayrollSettingsTabs } from "@/features/payroll/components/payroll-settings-tabs"

export default function PayrollSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="px-4 lg:px-6">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-muted-foreground -ml-2 gap-1"
        >
          <Link href="/hr-lounge/payroll">
            <IconArrowLeft className="size-4" />
            Back to payroll
          </Link>
        </Button>
      </div>
      <PageHeader
        title="Payroll settings"
        description="Approval flow and payslip templates. CPF rates and statutory funds are under Compensation."
      />
      <PayrollSettingsTabs />
    </div>
  )
}
