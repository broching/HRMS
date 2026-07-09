import { redirect } from "next/navigation"

// Members management merged into the HR Lounge employee list (role changer +
// status columns). Keep this route as a redirect for existing links/bookmarks.
export default function MembersSettingsRedirect() {
  redirect("/hr-lounge")
}
