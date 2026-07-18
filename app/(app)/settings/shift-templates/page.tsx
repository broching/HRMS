import { redirect } from "next/navigation"

// Shift templates live under the Roster & overtime → Shift setup tab.
export default function ShiftTemplatesPage() {
  redirect("/hr-lounge/roster?view=setup&tab=templates")
}
