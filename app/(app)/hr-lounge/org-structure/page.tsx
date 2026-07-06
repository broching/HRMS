import { OrgStructureManager } from "@/features/org-structure/components/org-structure-manager"
import { RolesManager } from "@/features/org-structure/components/roles-manager"
import { PageHeader } from "@/components/shared/page-header"
import { Separator } from "@/components/ui/separator"

// Org structure is an HR Lounge module; the HR Lounge layout already provides
// the rail, so this page only renders its own content.
export default function OrgStructurePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Org structure"
        description="Departments, teams, positions, offices and roles used across the organization."
      />
      <OrgStructureManager />
      <Separator className="mx-4 w-auto lg:mx-6" />
      <RolesManager />
    </div>
  )
}
