"use client"

import { getErrorMessage } from "@/lib/errors"
import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { IconPlus, IconSettings } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { TaskCard, type BoardTask } from "@/features/projects/components/task-card"
import { TaskEditorDialog } from "@/features/projects/components/task-editor-dialog"
import { StageEditor } from "@/features/projects/components/stage-editor"

type BoardData = FunctionReturnType<typeof api.projects.board>
type Stage = BoardData["stages"][number]

export function ProjectBoard({
  projectId,
  canManage,
  onOpenTask,
}: {
  projectId: Id<"projects">
  canManage: boolean
  onOpenTask: (taskId: Id<"projectTasks">) => void
}) {
  const data = useQuery(api.projects.board, { projectId })
  const moveTask = useMutation(api.projects.moveTask)

  // Local ordering so drags feel instant; re-synced from the server on change.
  const [items, setItems] = React.useState<Record<string, string[]>>({})
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [addStage, setAddStage] = React.useState<Stage | null>(null)
  const [manageOpen, setManageOpen] = React.useState(false)

  const taskMap = React.useMemo(() => {
    const m = new Map<string, BoardTask>()
    for (const t of data?.tasks ?? []) m.set(t._id, t)
    return m
  }, [data])

  React.useEffect(() => {
    if (!data) return
    const next: Record<string, string[]> = {}
    for (const s of data.stages) next[s._id] = []
    for (const t of data.tasks) {
      const key = t.stageId ?? data.stages[0]?._id
      if (key && next[key]) next[key].push(t._id)
    }
    setItems(next)
  }, [data])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )

  function findContainer(id: string): string | undefined {
    if (items[id]) return id
    return Object.keys(items).find((k) => items[k].includes(id))
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e
    if (!over) return
    const activeC = findContainer(String(active.id))
    const overC = findContainer(String(over.id))
    if (!activeC || !overC || activeC === overC) return
    setItems((prev) => {
      const activeItems = prev[activeC]
      const overItems = prev[overC]
      const activeIndex = activeItems.indexOf(String(active.id))
      const overIndex = overItems.indexOf(String(over.id))
      const insertAt = overIndex >= 0 ? overIndex : overItems.length
      return {
        ...prev,
        [activeC]: activeItems.filter((id) => id !== String(active.id)),
        [overC]: [
          ...overItems.slice(0, insertAt),
          String(active.id),
          ...overItems.slice(insertAt),
        ],
      }
    })
  }

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    setActiveId(null)
    if (!over) return
    const overC = findContainer(String(over.id))
    if (!overC) return
    // Reorder within the destination column to the drop position.
    let next = items
    const col = items[overC]
    const activeIndex = col.indexOf(String(active.id))
    const overIndex = col.indexOf(String(over.id))
    if (overIndex >= 0 && activeIndex >= 0 && activeIndex !== overIndex) {
      next = { ...items, [overC]: arrayMove(col, activeIndex, overIndex) }
      setItems(next)
    }
    try {
      await moveTask({
        taskId: active.id as Id<"projectTasks">,
        stageId: overC as Id<"projectStages">,
        orderedTaskIds: next[overC] as Id<"projectTasks">[],
      })
    } catch (err) {
      toast.error(getErrorMessage(err, "Couldn't move the task."))
    }
  }

  if (data === undefined) {
    return (
      <div className="flex gap-3 overflow-x-auto px-4 pb-4 lg:px-6">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-72 w-72 shrink-0 rounded-lg" />
        ))}
      </div>
    )
  }

  const activeTask = activeId ? taskMap.get(activeId) : null

  const columns = (
    <div className="flex items-start gap-3 overflow-x-auto px-4 pb-4 lg:px-6">
      {data.stages.map((stage) => (
        <BoardColumn
          key={stage._id}
          stage={stage}
          taskIds={items[stage._id] ?? []}
          taskMap={taskMap}
          canManage={canManage}
          onAdd={() => setAddStage(stage)}
          onOpenTask={onOpenTask}
        />
      ))}
      {canManage && (
        <Button
          variant="ghost"
          className="text-muted-foreground h-10 shrink-0"
          onClick={() => setManageOpen(true)}
        >
          <IconSettings className="size-4" />
          Columns
        </Button>
      )}
    </div>
  )

  return (
    <>
      {canManage ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          {columns}
          <DragOverlay>
            {activeTask ? <TaskCard task={activeTask} dragging /> : null}
          </DragOverlay>
        </DndContext>
      ) : (
        columns
      )}

      {addStage && (
        <TaskEditorDialog
          open={addStage !== null}
          onOpenChange={(o) => !o && setAddStage(null)}
          projectId={projectId}
          stageId={addStage._id}
        />
      )}
      <StageEditor
        projectId={projectId}
        stages={data.stages}
        open={manageOpen}
        onOpenChange={setManageOpen}
      />
    </>
  )
}

function BoardColumn({
  stage,
  taskIds,
  taskMap,
  canManage,
  onAdd,
  onOpenTask,
}: {
  stage: Stage
  taskIds: string[]
  taskMap: Map<string, BoardTask>
  canManage: boolean
  onAdd: () => void
  onOpenTask: (taskId: Id<"projectTasks">) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage._id })
  return (
    <div
      className={cn(
        "bg-muted/40 flex max-h-[calc(100vh-16rem)] w-72 shrink-0 flex-col rounded-lg",
        isOver && "ring-primary/30 ring-2",
      )}
    >
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span
          className="size-2.5 rounded-full"
          style={{ backgroundColor: stage.color ?? "#94a3b8" }}
        />
        <span className="text-sm font-medium">{stage.name}</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {taskIds.length}
        </span>
        {canManage && (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto size-6"
            onClick={onAdd}
            title="Add task"
          >
            <IconPlus className="size-4" />
          </Button>
        )}
      </div>
      <div ref={setNodeRef} className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {taskIds.length === 0 ? (
            <p className="text-muted-foreground px-1 py-6 text-center text-xs">—</p>
          ) : (
            taskIds.map((id) => {
              const task = taskMap.get(id)
              if (!task) return null
              return (
                <SortableTask
                  key={id}
                  id={id}
                  task={task}
                  draggable={canManage}
                  onOpen={() => onOpenTask(task._id)}
                />
              )
            })
          )}
        </SortableContext>
      </div>
    </div>
  )
}

function SortableTask({
  id,
  task,
  draggable,
  onOpen,
}: {
  id: string
  task: BoardTask
  draggable: boolean
  onOpen: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: !draggable })
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...(draggable ? listeners : {})}>
      <TaskCard task={task} onClick={onOpen} />
    </div>
  )
}
