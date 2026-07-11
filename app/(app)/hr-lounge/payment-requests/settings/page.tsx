import { PageHeader } from "@/components/shared/page-header"
import { PaymentRequestsTabs } from "@/features/payment-requests/components/payment-requests-tabs"
import { PaymentRequestSettingsShell } from "@/features/payment-requests/components/payment-request-settings-shell"

export default function PaymentRequestSettingsPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Payment Requests"
        description="Approval flows and form templates."
      />
      <PaymentRequestsTabs />
      <PaymentRequestSettingsShell />
    </div>
  )
}
