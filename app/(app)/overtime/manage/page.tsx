import { PageHeader } from "@/components/shared/page-header"
import { RoleGate } from "@/components/shared/role-gate"
import { OvertimeManager } from "@/features/overtime/components/overtime-manager"

export default function ManageOvertimePage() {
  return (
    <RoleGate permission="scheduling:roster">
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Overtime"
          description="Schedule overtime and approve worked hours for payroll."
        />
        <OvertimeManager />
      </div>
    </RoleGate>
  )
}
