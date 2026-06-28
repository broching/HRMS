"use client"

import { OrganizationList } from "@clerk/nextjs"
import { dark } from "@clerk/themes"
import { useTheme } from "next-themes"

// Shown to signed-in users without an active organization (see OrgGuard in
// app/(app)/layout.tsx). Lets them create a company or pick an existing one;
// either path lands on the dashboard with that org active.
export default function SelectOrgPage() {
  const { theme } = useTheme()

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6">
      <OrganizationList
        hidePersonal
        afterSelectOrganizationUrl="/dashboard"
        afterCreateOrganizationUrl="/dashboard"
        appearance={{ baseTheme: theme === "dark" ? dark : undefined }}
      />
    </div>
  )
}
