import { redirect } from "next/navigation"

// The employee's overtime now lives in My Schedule.
export default function OvertimePage() {
  redirect("/scheduling")
}
