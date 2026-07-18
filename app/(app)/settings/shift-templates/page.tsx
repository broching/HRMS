import { redirect } from "next/navigation"

// Shift templates + work patterns are merged into one tabbed Scheduling page.
export default function ShiftTemplatesPage() {
  redirect("/settings/scheduling?tab=templates")
}
