import { LeavePolicyEditor } from "@/features/leave-admin/components/leave-policy-editor"
import type { Id } from "@/convex/_generated/dataModel"

export default async function LeavePolicyEditorPage({
  params,
}: {
  params: Promise<{ leaveTypeId: string }>
}) {
  const { leaveTypeId } = await params
  return <LeavePolicyEditor leaveTypeId={leaveTypeId as Id<"leaveTypes">} />
}
