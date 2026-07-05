import { PageHeader } from "@/components/shared/page-header"
import { RoleGate } from "@/components/shared/role-gate"
import { RosterBuilder } from "@/features/scheduling/components/roster-builder"

export default function RosterPage() {
  return (
    <RoleGate permission="scheduling:roster">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Roster"
          description="Build the weekly schedule, then publish it to your team."
        />
        <RosterBuilder />
      </div>
    </RoleGate>
  )
}
