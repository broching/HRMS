import { redirect } from "next/navigation"

// Organization settings moved into the HR Lounge (our own UI). Keep this route
// as a redirect so existing links and bookmarks still resolve.
export default function OrganizationSettingsRedirect() {
  redirect("/hr-lounge/org-settings")
}
