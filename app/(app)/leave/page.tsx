import { PageHeader } from "@/components/shared/page-header"
import { ApplyLeaveDialog } from "@/features/leave/components/apply-leave-dialog"
import { LeaveBalances } from "@/features/leave/components/leave-balances"
import { MyLeaveRequests } from "@/features/leave/components/my-leave-requests"
import { LeaveCalendar } from "@/features/leave/components/leave-calendar"

export default function LeavePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My leave"
        description="Your requests, the team's calendar, and your balances."
      >
        <ApplyLeaveDialog />
      </PageHeader>

      {/* Primary: the leaves you've applied for. */}
      <section className="flex flex-col gap-2">
        <h2 className="px-4 text-sm font-medium lg:px-6">My requests</h2>
        <MyLeaveRequests />
      </section>

      {/* Team calendar — approved leave and public holidays across the org. */}
      <section className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5 px-4 lg:px-6">
          <h2 className="text-sm font-medium">Team calendar</h2>
          <p className="text-muted-foreground text-xs">
            Approved leave and public holidays across the organization.
          </p>
        </div>
        <LeaveCalendar />
      </section>

      {/* Balances — quick reference, demoted below the list + calendar. */}
      <section className="flex flex-col gap-2">
        <h2 className="px-4 text-sm font-medium lg:px-6">My balances</h2>
        <LeaveBalances compact />
      </section>
    </div>
  )
}
