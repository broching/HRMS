import type { Metadata } from "next"
import { SuperAdminConsole } from "@/features/super-admin/components/super-admin-console"

export const metadata: Metadata = {
  title: "Platform Console — LeadMighty",
  robots: { index: false, follow: false },
}

export default function SuperAdminPage() {
  return <SuperAdminConsole />
}
