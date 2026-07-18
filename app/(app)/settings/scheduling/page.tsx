import { redirect } from "next/navigation"

// Shift setup (work patterns + shift templates) now lives as a tab under
// Roster & overtime (HR Lounge). Old links redirect there.
export default function SchedulingSettingsPage() {
  redirect("/hr-lounge/roster?view=setup")
}
