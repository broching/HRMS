import { redirect } from "next/navigation"

// Claim types now live under HR Lounge → Expense Claims → Settings. Keep this
// route as a redirect for existing links/bookmarks.
export default function ClaimTypesSettingsRedirect() {
  redirect("/hr-lounge/claims/settings")
}
