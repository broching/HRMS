import { redirect } from "next/navigation"

// Overtime scheduling is merged into the roster board.
export default function ManageOvertimePage() {
  redirect("/scheduling/roster")
}
