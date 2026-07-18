"use client"

import { getErrorMessage } from "@/lib/errors"
import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import {
  IconCheck,
  IconPaperclip,
  IconPencil,
  IconTrash,
  IconEye,
  IconEyeOff,
  IconCalendarEvent,
  IconFlag,
  IconUsers,
  IconClock,
  IconArrowLeft,
  IconFlag3,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DocumentViewer } from "@/components/shared/document-viewer"
import { ConfirmDialog } from "@/features/claims/components/confirm-dialog"
import { cn } from "@/lib/utils"
import { formatMinutes } from "@/features/timesheets/lib/time"
import {
  dueMeta,
  dueToneClasses,
  priorityClasses,
  priorityLabel,
  type TaskPriority,
} from "@/features/projects/lib/task"
import {
  TaskAttachmentsPicker,
  type TaskAttachment,
} from "@/features/projects/components/task-attachments"
import {
  TaskEditorDialog,
  type TaskEditorValue,
} from "@/features/projects/components/task-editor-dialog"
import {
  RichTextView,
  isRichTextEmpty,
} from "@/features/projects/components/task-rich-editor"
import { TaskComments } from "@/features/projects/components/task-comments"
import { TaskChecklist } from "@/features/projects/components/task-checklist"
import { TaskSubtasks } from "@/features/projects/components/task-subtasks"
import { TaskDependencies } from "@/features/projects/components/task-dependencies"
import { LabelPicker, LabelChip } from "@/features/projects/components/task-labels"
import { CustomFieldsView } from "@/features/projects/components/task-custom-fields"

/**
 * Full task view + hub: description · checklist · subtasks · labels · custom
 * fields · assignees · dates · dependencies · comments · logged time (read-only
 * rollup) · watchers. Anyone assigned can read it, tick checklist/subtasks, and
 * mark it complete; task managers get edit, attachments, labels, and archive.
 * Navigating into a subtask (or up to a parent) swaps the panel's task in place.
 */
export function TaskDetailPanel({
  taskId,
  open,
  onOpenChange,
}: {
  taskId: Id<"projectTasks"> | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  // The task currently shown — starts at `taskId`, but subtask / parent links
  // navigate within the same dialog.
  const [viewId, setViewId] = React.useState<Id<"projectTasks"> | null>(taskId)
  React.useEffect(() => {
    if (open) setViewId(taskId)
  }, [taskId, open])

  const detail = useQuery(
    api.projects.taskDetail,
    viewId ? { taskId: viewId } : "skip",
  )
  const fieldDefs = useQuery(api.taskFields.list, open ? {} : "skip")
  const setStatus = useMutation(api.projects.setTaskStatus)
  const updateTask = useMutation(api.projects.updateTask)
  const watchTask = useMutation(api.projects.watch)
  const addAttachments = useMutation(api.projects.addTaskAttachments)
  const removeAttachment = useMutation(api.projects.removeTaskAttachment)

  const [editorOpen, setEditorOpen] = React.useState(false)
  const [archiveOpen, setArchiveOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [viewer, setViewer] = React.useState<{ url: string; name: string } | null>(
    null,
  )

  const done = detail?.status === "done"
  const due = detail ? dueMeta(detail.dueDate, detail.status) : null

  async function toggleDone() {
    if (!detail) return
    setBusy(true)
    try {
      await setStatus({ taskId: detail._id, status: done ? "open" : "done" })
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't update the task."))
    } finally {
      setBusy(false)
    }
  }

  async function persistUploads(next: TaskAttachment[]) {
    if (!detail || next.length === 0) return
    try {
      await addAttachments({
        taskId: detail._id,
        files: next.map((a) => ({ storageId: a.id, name: a.name })),
      })
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't attach the files."))
    }
  }

  const editorValue: TaskEditorValue | null = detail
    ? {
        taskId: detail._id,
        name: detail.name,
        description: detail.description,
        priority: detail.priority as TaskPriority | null,
        dueDate: detail.dueDate,
        startDate: detail.startDate,
        estimateMinutes: detail.estimateMinutes,
        assigneeIds: detail.assignees.map((a) => a.employeeId),
        labelIds: detail.labelIds,
        customFields: detail.customFields,
        milestoneId: detail.milestoneId,
      }
    : null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {detail === undefined ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : detail === null ? (
            <div className="py-8 text-center">
              <DialogHeader>
                <DialogTitle className="sr-only">Task</DialogTitle>
              </DialogHeader>
              <p className="text-muted-foreground text-sm">
                This task isn&apos;t available.
              </p>
            </div>
          ) : (
            <>
              <DialogHeader>
                {detail.parentTaskId ? (
                  <button
                    type="button"
                    onClick={() => setViewId(detail.parentTaskId)}
                    className="text-muted-foreground hover:text-foreground -ml-1 flex w-fit items-center gap-1 text-xs"
                  >
                    <IconArrowLeft className="size-3.5" />
                    {detail.parentName ?? "Parent task"}
                  </button>
                ) : (
                  <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: detail.projectColor ?? "#94a3b8" }}
                    />
                    <span className="truncate">{detail.projectName}</span>
                  </div>
                )}
                <DialogTitle
                  className={cn(
                    "pr-6 text-left",
                    done && "text-muted-foreground line-through",
                  )}
                >
                  {detail.name}
                </DialogTitle>
              </DialogHeader>

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "gap-1",
                    done
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground",
                  )}
                >
                  {done ? <IconCheck className="size-3" /> : null}
                  {done ? "Completed" : "Open"}
                </Badge>
                {detail.blocked && !done && (
                  <Badge
                    variant="outline"
                    className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  >
                    Blocked
                  </Badge>
                )}
                {detail.priority && (
                  <Badge
                    variant="outline"
                    className={cn("gap-1", priorityClasses(detail.priority as TaskPriority))}
                  >
                    <IconFlag className="size-3" />
                    {priorityLabel(detail.priority as TaskPriority)}
                  </Badge>
                )}
                {due && (
                  <span
                    className={cn(
                      "flex items-center gap-1 text-xs",
                      dueToneClasses(due.tone),
                    )}
                  >
                    <IconCalendarEvent className="size-3.5" />
                    Due {due.label}
                    {due.tone === "overdue" && !done && " · overdue"}
                  </span>
                )}
                {detail.milestoneName && (
                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                    <IconFlag3 className="size-3.5" />
                    {detail.milestoneName}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() =>
                    watchTask({ taskId: detail._id, watching: !detail.watching }).catch(
                      () => toast.error("Couldn't update watching."),
                    )
                  }
                  className={cn(
                    "ml-auto flex items-center gap-1 text-xs",
                    detail.watching
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  title={detail.watching ? "Stop watching" : "Watch this task"}
                >
                  {detail.watching ? (
                    <IconEye className="size-4" />
                  ) : (
                    <IconEyeOff className="size-4" />
                  )}
                  {detail.watcherCount > 0 ? detail.watcherCount : ""}
                </button>
              </div>

              {done && detail.completedByName && (
                <p className="text-muted-foreground text-xs">
                  Completed by {detail.completedByName}
                  {detail.completedAt
                    ? ` · ${new Date(detail.completedAt).toLocaleDateString()}`
                    : ""}
                </p>
              )}

              {/* Logged vs estimate (from the timesheet) */}
              {(detail.estimateMinutes || detail.loggedMinutes > 0) && (
                <div className="bg-muted/30 flex flex-col gap-1.5 rounded-lg border p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <IconClock className="size-3.5" />
                      Time logged
                    </span>
                    <span className="tabular-nums">
                      <span className="font-medium">
                        {formatMinutes(detail.loggedMinutes)}
                      </span>
                      {detail.estimateMinutes ? (
                        <span
                          className={cn(
                            "text-muted-foreground",
                            detail.loggedMinutes > detail.estimateMinutes &&
                              "text-red-600 dark:text-red-400",
                          )}
                        >
                          {" "}
                          / {formatMinutes(detail.estimateMinutes)} est
                        </span>
                      ) : null}
                    </span>
                  </div>
                  {detail.estimateMinutes ? (
                    <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          detail.loggedMinutes > detail.estimateMinutes
                            ? "bg-red-500"
                            : "bg-primary",
                        )}
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              (detail.loggedMinutes / detail.estimateMinutes) * 100,
                            ),
                          )}%`,
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              )}

              {/* Labels */}
              <div className="flex flex-col gap-1.5">
                {detail.canManage ? (
                  <LabelPicker
                    value={detail.labelIds}
                    canManage={detail.canManage}
                    onChange={(labelIds) =>
                      updateTask({ taskId: detail._id, labelIds }).catch(() =>
                        toast.error("Couldn't update labels."),
                      )
                    }
                  />
                ) : detail.labels.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {detail.labels.map((l) => (
                      <LabelChip key={l._id} label={l} />
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Description */}
              {!isRichTextEmpty(detail.description) && (
                <div className="flex flex-col gap-1">
                  <Label className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
                    Description
                  </Label>
                  <RichTextView html={detail.description} />
                </div>
              )}

              {/* Custom fields */}
              {fieldDefs && (
                <CustomFieldsView defs={fieldDefs} values={detail.customFields} />
              )}

              {/* Checklist */}
              <TaskChecklist
                taskId={detail._id}
                items={detail.checklist}
                canEdit={detail.canComplete}
              />

              {/* Subtasks (top-level tasks only) */}
              {!detail.parentTaskId && (
                <TaskSubtasks
                  parentTaskId={detail._id}
                  projectId={detail.projectId}
                  subtasks={detail.subtasks}
                  canManage={detail.canManage}
                  canComplete={detail.canComplete}
                  onOpenSubtask={setViewId}
                />
              )}

              {/* Dependencies */}
              <TaskDependencies
                taskId={detail._id}
                projectId={detail.projectId}
                blockedBy={detail.blockedBy}
                blocks={detail.blocks}
                canManage={detail.canManage}
              />

              {/* Assignees */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase">
                  <IconUsers className="size-3.5" />
                  Assigned ({detail.assignees.length})
                </Label>
                {detail.assignees.length === 0 ? (
                  <p className="text-muted-foreground text-xs">No one assigned.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {detail.assignees.map((a) => (
                      <Badge key={a.employeeId} variant="secondary" className="font-normal">
                        {a.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Attachments */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase">
                  <IconPaperclip className="size-3.5" />
                  Attachments ({detail.attachments.length})
                </Label>
                {detail.attachments.length === 0 && !detail.canManage ? (
                  <p className="text-muted-foreground text-xs">No attachments.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {detail.attachments.map((f) => (
                      <li
                        key={f.index}
                        className="bg-muted/30 flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm"
                      >
                        <IconPaperclip className="text-muted-foreground size-3.5 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{f.name}</span>
                        {f.url && (
                          <button
                            type="button"
                            title="View"
                            onClick={() => setViewer({ url: f.url!, name: f.name })}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <IconEye className="size-4" />
                          </button>
                        )}
                        {detail.canManage && (
                          <button
                            type="button"
                            title="Remove"
                            onClick={() =>
                              removeAttachment({ taskId: detail._id, index: f.index })
                            }
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <IconTrash className="size-4" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {detail.canManage && (
                  <TaskAttachmentsPicker
                    value={[]}
                    onChange={persistUploads}
                    max={8 - detail.attachments.length}
                  />
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2">
                  {detail.canManage && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditorOpen(true)}
                      >
                        <IconPencil className="size-4" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setArchiveOpen(true)}
                      >
                        <IconTrash className="size-4" />
                        Archive
                      </Button>
                    </>
                  )}
                </div>
                {detail.canComplete && (
                  <Button
                    size="sm"
                    variant={done ? "outline" : "default"}
                    onClick={toggleDone}
                    disabled={busy}
                  >
                    <IconCheck className="size-4" />
                    {done ? "Reopen" : "Mark complete"}
                  </Button>
                )}
              </div>

              {/* Comments / activity */}
              <div className="border-t pt-3">
                <TaskComments taskId={detail._id} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {editorValue && (
        <TaskEditorDialog
          open={editorOpen}
          onOpenChange={setEditorOpen}
          projectId={detail!.projectId}
          task={editorValue}
        />
      )}

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive this task?"
        description="It will be removed from the project's active task list. Logged time is kept."
        confirmLabel="Archive task"
        destructive
        busy={busy}
        onConfirm={async () => {
          if (!detail) return
          setBusy(true)
          try {
            await updateTask({ taskId: detail._id, archived: true })
            setArchiveOpen(false)
            // Fall back to the parent when archiving a subtask, else close.
            if (detail.parentTaskId) setViewId(detail.parentTaskId)
            else onOpenChange(false)
          } catch (e) {
            toast.error(getErrorMessage(e, "Couldn't archive the task."))
          } finally {
            setBusy(false)
          }
        }}
      />

      <DocumentViewer
        url={viewer?.url ?? ""}
        title={viewer?.name}
        fileName={viewer?.name}
        open={viewer !== null}
        onOpenChange={(o) => !o && setViewer(null)}
      />
    </>
  )
}
