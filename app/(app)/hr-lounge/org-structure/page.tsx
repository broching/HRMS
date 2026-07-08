import { OrgStructureShell } from "@/features/org-structure/components/org-structure-shell"
import { PageHeader } from "@/components/shared/page-header"

// Org structure is an HR Lounge module; the HR Lounge layout already provides
// the rail, so this page only renders its own content.
export default function OrgStructurePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Org structure"
        description="Departments, teams, positions, offices and roles used across the organization."
      />
      <OrgStructureShell />
    </div>
  )
}
