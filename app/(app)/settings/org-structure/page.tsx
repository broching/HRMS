import { OrgStructureManager } from "@/features/org-structure/components/org-structure-manager"
import { RolesManager } from "@/features/org-structure/components/roles-manager"
import { HrLoungeShell } from "@/features/hr-lounge/components/hr-lounge-shell"
import { PageHeader } from "@/components/shared/page-header"
import { Separator } from "@/components/ui/separator"

// Org structure is an HR Lounge module, so it renders inside the HR Lounge rail.
export default function OrgStructurePage() {
  return (
    <HrLoungeShell>
      <div className="flex flex-col gap-6 py-4">
        <PageHeader
          title="Org structure"
          description="Departments, teams, positions, offices and roles used across the organization."
        />
        <OrgStructureManager />
        <Separator className="mx-4 w-auto lg:mx-6" />
        <RolesManager />
      </div>
    </HrLoungeShell>
  )
}
