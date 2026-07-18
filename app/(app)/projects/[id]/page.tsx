import { Suspense } from "react"
import { RoleGate } from "@/components/shared/role-gate"
import { ProjectWorkspace } from "@/features/projects/components/project-workspace"
import type { Id } from "@/convex/_generated/dataModel"

// Full project workspace: Kanban board, task list, timeline, overview charts, and
// people. Reached from the Projects grid (Team side and HR Lounge). Wrapped in
// Suspense because the workspace reads `?task=` via useSearchParams.
export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <RoleGate anyPermission={["projects:manage", "tasks:manage"]}>
      <Suspense>
        <ProjectWorkspace projectId={id as Id<"projects">} />
      </Suspense>
    </RoleGate>
  )
}
