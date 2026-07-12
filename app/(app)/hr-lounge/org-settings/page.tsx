import { OrgSettings } from "@/features/org-settings/components/org-settings"
import { PageHeader } from "@/components/shared/page-header"

// Organization settings is an HR Lounge module; the HR Lounge layout already
// provides the rail, so this page only renders its own content.
export default function OrgSettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Organization"
        description="Profile, locale and statutory defaults for your organization."
      />
      <div className="flex flex-col gap-6 px-4 lg:px-6">
        <OrgSettings />
      </div>
    </div>
  )
}
