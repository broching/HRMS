import { PageHeader } from "@/components/shared/page-header"
import { ApprovalQueue } from "@/features/leave/components/approval-queue"

export default function LeaveApprovalsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Leave approvals"
        description="Requests awaiting your decision."
      />
      <ApprovalQueue />
    </div>
  )
}
