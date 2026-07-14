import { RoleGate } from "@/components/shared/role-gate"
import { ProjectsManager } from "@/features/projects/components/projects-manager"

export default function ProjectsPage() {
  return (
    <RoleGate permission="projects:manage">
      <ProjectsManager />
    </RoleGate>
  )
}
