"use client"

import { getErrorMessage } from "@/lib/errors"
import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { IconMessageCircle, IconPencil, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { initials, avatarTone } from "@/features/projects/lib/task"
import {
  TaskRichEditor,
  RichTextView,
  isRichTextEmpty,
} from "@/features/projects/components/task-rich-editor"

export function TaskComments({ taskId }: { taskId: Id<"projectTasks"> }) {
  const comments = useQuery(api.projects.listComments, { taskId })
  const addComment = useMutation(api.projects.addComment)
  const updateComment = useMutation(api.projects.updateComment)
  const deleteComment = useMutation(api.projects.deleteComment)

  const [draft, setDraft] = React.useState("")
  const [posting, setPosting] = React.useState(false)
  const [editingId, setEditingId] = React.useState<Id<"taskComments"> | null>(null)
  const [editDraft, setEditDraft] = React.useState("")

  async function post() {
    if (isRichTextEmpty(draft)) return
    setPosting(true)
    try {
      await addComment({ taskId, body: draft })
      setDraft("")
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't post the comment."))
    } finally {
      setPosting(false)
    }
  }

  async function saveEdit(commentId: Id<"taskComments">) {
    if (isRichTextEmpty(editDraft)) return
    try {
      await updateComment({ commentId, body: editDraft })
      setEditingId(null)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't update the comment."))
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase">
        <IconMessageCircle className="size-3.5" />
        Comments ({comments?.length ?? 0})
      </div>

      {comments === undefined ? (
        <Skeleton className="h-16 w-full" />
      ) : comments.length === 0 ? (
        <p className="text-muted-foreground text-xs">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((c) => (
            <li key={c._id} className="flex gap-2.5">
              <Avatar className="size-7 shrink-0">
                <AvatarFallback className={cn("text-[10px] font-medium", avatarTone(c.authorName))}>
                  {initials(c.authorName)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{c.authorName}</span>
                  <span className="text-muted-foreground text-[11px]">
                    {new Date(c.createdAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                    {c.editedAt ? " · edited" : ""}
                  </span>
                  {c.canEdit && editingId !== c._id && (
                    <div className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        title="Edit"
                        onClick={() => {
                          setEditingId(c._id)
                          setEditDraft(c.body)
                        }}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <IconPencil className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        onClick={() => deleteComment({ commentId: c._id })}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <IconTrash className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                {editingId === c._id ? (
                  <div className="mt-1 flex flex-col gap-2">
                    <TaskRichEditor
                      value={editDraft}
                      onChange={setEditDraft}
                      minHeight="min-h-20"
                    />
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => saveEdit(c._id)}>
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm">
                    <RichTextView html={c.body} />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <TaskRichEditor
          value={draft}
          onChange={setDraft}
          placeholder="Write a comment…"
          minHeight="min-h-20"
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={post} disabled={posting || isRichTextEmpty(draft)}>
            {posting ? "Posting…" : "Comment"}
          </Button>
        </div>
      </div>
    </div>
  )
}
