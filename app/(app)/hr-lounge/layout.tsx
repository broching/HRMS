import { HrLoungeShell } from "@/features/hr-lounge/components/hr-lounge-shell"

export default function HrLoungeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <HrLoungeShell>{children}</HrLoungeShell>
}
