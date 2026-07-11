import { PageHeader } from "@/components/shared/page-header"
import { RoleGate } from "@/components/shared/role-gate"
import { PaymentRequestsApprovalQueue } from "@/features/payment-requests/components/payment-requests-approval-queue"

export default function PaymentRequestApprovalsPage() {
  return (
    <RoleGate permission="payment_requests:approve">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Payment requests"
          description="Payment requests awaiting your decision."
        />
        <PaymentRequestsApprovalQueue source="approver" />
      </div>
    </RoleGate>
  )
}
