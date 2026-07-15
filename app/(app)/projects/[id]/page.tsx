import { RoleGate } from "@/components/shared/role-gate"
import { ProjectWorkspace } from "@/features/projects/components/project-workspace"
import type { Id } from "@/convex/_generated/dataModel"

// Full project workspace: Kanban board, task list, overview charts, and people.
// Reached from the Projects grid (Team side and HR Lounge).
export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <RoleGate anyPermission={["projects:manage", "tasks:manage"]}>
      <ProjectWorkspace projectId={id as Id<"projects">} />
    </RoleGate>
  )
}
