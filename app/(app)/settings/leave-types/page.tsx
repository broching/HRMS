import { redirect } from "next/navigation"

// Leave types now live under HR Lounge → Leave → Leave Policies, and the public
// holiday calendar under HR Lounge → Leave → Public Holidays. Keep this route as
// a redirect for existing links/bookmarks.
export default function LeaveTypesSettingsRedirect() {
  redirect("/hr-lounge/leave")
}
