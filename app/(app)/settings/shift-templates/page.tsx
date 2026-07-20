import { redirect } from "next/navigation"

// Shift templates were retired — scheduling now runs on work patterns, under
// Roster & overtime → Work patterns. Old links land there.
export default function ShiftTemplatesPage() {
  redirect("/hr-lounge/roster?view=patterns")
}
