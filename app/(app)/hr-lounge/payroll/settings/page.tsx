import { redirect } from "next/navigation"

// Payroll settings now live as tabs on the main Payroll page. Preserve old links
// by mapping the previous default (approval flow) onto the new tabbed view.
export default function PayrollSettingsPage() {
  redirect("/hr-lounge/payroll?tab=approval")
}
