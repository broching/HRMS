import { PageHeader } from "@/components/shared/page-header"
import { PaymentRequestsTabs } from "@/features/payment-requests/components/payment-requests-tabs"
import { PaymentRequestsApprovalQueue } from "@/features/payment-requests/components/payment-requests-approval-queue"

export default function HrPaymentRequestsPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Payment Requests"
        description="Every payment request across the organization — review, approve, export and download."
      />
      <PaymentRequestsTabs />
      <PaymentRequestsApprovalQueue source="all" />
    </div>
  )
}
