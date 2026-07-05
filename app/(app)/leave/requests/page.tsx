import { PageHeader } from "@/components/shared/page-header"
import { RoleGate } from "@/components/shared/role-gate"
import { ApprovalQueue } from "@/features/leave/components/approval-queue"

export default function LeaveApprovalsPage() {
  return (
    <RoleGate permission="leave:approve">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Leave approvals"
          description="Requests awaiting your decision."
        />
        <ApprovalQueue />
      </div>
    </RoleGate>
  )
}
