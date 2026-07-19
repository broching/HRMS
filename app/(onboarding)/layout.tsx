import { redirect } from "next/navigation"
import { auth } from "@clerk/nextjs/server"

// The onboarding funnel is the one authenticated surface that must NOT require
// an active organization — it's where a signed-in user creates one. Signed-out
// visitors go back to the landing page (modal sign-in).
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { userId } = await auth()
  if (!userId) redirect("/")
  return <>{children}</>
}
