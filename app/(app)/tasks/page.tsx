import { PageHeader } from "@/components/shared/page-header"
import { MyTasks } from "@/features/projects/components/my-tasks"

export default function MyTasksPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My Tasks"
        description="Tasks assigned to you across your projects."
      />
      <MyTasks />
    </div>
  )
}
