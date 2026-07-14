import { RoleGate } from "@/components/shared/role-gate"
import { ProjectsManager } from "@/features/projects/components/projects-manager"

// Team-accessible projects + task management. Managers (tasks:manage) create and
// assign tasks here; HR reaches the same surface (plus org-wide time oversight)
// from the HR Lounge at /hr-lounge/projects.
export default function ProjectsPage() {
  return (
    <RoleGate anyPermission={["projects:manage", "tasks:manage"]}>
      <ProjectsManager />
    </RoleGate>
  )
}
