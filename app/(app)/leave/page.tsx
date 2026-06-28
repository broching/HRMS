import { PageHeader } from "@/components/shared/page-header"
import { ApplyLeaveDialog } from "@/features/leave/components/apply-leave-dialog"
import { LeaveBalances } from "@/features/leave/components/leave-balances"
import { MyLeaveRequests } from "@/features/leave/components/my-leave-requests"

export default function LeavePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My leave"
        description="Your leave balances and request history."
      >
        <ApplyLeaveDialog />
      </PageHeader>
      <LeaveBalances />
      <div className="flex flex-col gap-2">
        <h2 className="px-4 text-sm font-medium lg:px-6">Requests</h2>
        <MyLeaveRequests />
      </div>
    </div>
  )
}
