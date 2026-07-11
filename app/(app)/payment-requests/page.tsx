import { PageHeader } from "@/components/shared/page-header"
import { MyPaymentRequests } from "@/features/payment-requests/components/my-payment-requests"

export default function PaymentRequestsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My payment requests"
        description="Raise a request for payment and track its approval."
      />
      <MyPaymentRequests />
    </div>
  )
}
