import { PageHeader } from "@/components/shared/page-header"
import { RoleGate } from "@/components/shared/role-gate"
import { HrLoungeShell } from "@/features/hr-lounge/components/hr-lounge-shell"
import { RosterWorkspace } from "@/features/scheduling/components/roster-workspace"

export default function HrRosterPage() {
  return (
    <HrLoungeShell>
      <RoleGate permission="scheduling:manage">
        <div className="flex flex-col gap-6">
          <PageHeader
            title="Roster & overtime"
            description="Schedule and review shifts, overtime and attendance across all employees."
          />
          <RosterWorkspace scope="org" />
        </div>
      </RoleGate>
    </HrLoungeShell>
  )
}
