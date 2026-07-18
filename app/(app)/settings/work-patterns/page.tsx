import { redirect } from "next/navigation"

// Work patterns + shift templates are merged into one tabbed Scheduling page.
export default function WorkPatternsPage() {
  redirect("/settings/scheduling")
}
