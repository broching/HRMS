import { OrgWorkspace } from "@/features/org-structure/components/org-workspace"
import { PageHeader } from "@/components/shared/page-header"

// Organization is an HR Lounge module; the HR Lounge layout provides the rail,
// so this page only renders its own content. It merges the org profile, the org
// structure and roles into one tabbed workspace.
export default function OrgSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Organization"
        description="Profile, structure, roles and statutory defaults for your organization."
      />
      <OrgWorkspace />
    </div>
  )
}
