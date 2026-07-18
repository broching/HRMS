import { redirect } from "next/navigation"

// Work patterns live under the Roster & overtime → Shift setup tab.
export default function WorkPatternsPage() {
  redirect("/hr-lounge/roster?view=setup")
}
