import { PageHeader } from "@/components/shared/page-header"
import { RoleGate } from "@/components/shared/role-gate"
import { RosterWorkspace } from "@/features/scheduling/components/roster-workspace"

export default function HrRosterPage() {
  return (
    <RoleGate permission="scheduling:manage">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Roster & overtime"
          description="Schedule and review shifts, overtime and attendance across all employees."
        />
        <RosterWorkspace scope="org" />
      </div>
    </RoleGate>
  )
}
