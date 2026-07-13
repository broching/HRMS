import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"

// The super-admin console lives outside the (app) group, so it has no active-org
// requirement and is never subject to the tenant billing gate. Sign-in is
// required here; the actual super-admin authorization is enforced server-side in
// Convex (see convex/superAdmin.ts) on every query — this layout only ensures a
// signed-in user so the console can call `whoami`.
export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { userId } = await auth()
  if (!userId) redirect("/")
  return <div className="bg-muted/20 min-h-svh">{children}</div>
}
