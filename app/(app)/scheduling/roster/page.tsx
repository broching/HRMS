import { PageHeader } from "@/components/shared/page-header"
import { RoleGate } from "@/components/shared/role-gate"
import { RosterWorkspace } from "@/features/scheduling/components/roster-workspace"

export default function RosterPage() {
  return (
    <RoleGate permission="scheduling:roster">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Roster & overtime"
          description="Schedule shifts and overtime for your team, see clocked attendance against the plan, then publish."
        />
        <RosterWorkspace scope="team" />
      </div>
    </RoleGate>
  )
}
