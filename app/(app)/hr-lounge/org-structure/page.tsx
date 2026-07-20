import { redirect } from "next/navigation"

// Org structure merged into the Organization workspace as a tab. Old links land
// on that tab.
export default function OrgStructurePage() {
  redirect("/hr-lounge/org-settings?tab=structure")
}
