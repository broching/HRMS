import { OrgStructureManager } from "@/features/org-structure/components/org-structure-manager"
import { PageHeader } from "@/components/shared/page-header"

export default function OrgStructurePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Org structure"
        description="Departments, teams, positions and offices used across employee records."
      />
      <OrgStructureManager />
    </div>
  )
}
