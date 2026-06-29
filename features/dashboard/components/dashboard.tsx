"use client"

import { PersonalDashboard } from "./personal-dashboard"

// Home is the default landing for everyone, regardless of role. Admin/HR reach
// the org-wide overview via the HR Lounge (see app/(app)/hr-lounge).
export function Dashboard() {
  return <PersonalDashboard />
}
