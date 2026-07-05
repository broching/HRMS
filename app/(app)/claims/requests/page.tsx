import { PageHeader } from "@/components/shared/page-header"
import { RoleGate } from "@/components/shared/role-gate"
import { ClaimsApprovalQueue } from "@/features/claims/components/claims-approval-queue"

export default function ClaimApprovalsPage() {
  return (
    <RoleGate permission="claims:approve">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Claim approvals"
          description="Claims awaiting your decision."
        />
        <ClaimsApprovalQueue />
      </div>
    </RoleGate>
  )
}
