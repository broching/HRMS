"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { IconPaperclip, IconX, IconArrowBackUp, IconTrash } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { FeedAudience } from "@/convex/lib/enums"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { FileUpload } from "@/components/shared/file-upload"
import { RichTextEditor } from "./rich-text-editor"

type Post = FunctionReturnType<typeof api.feed.list>[number]
type ExistingMedia = Post["media"][number]

export function CreatePostDialog({
  open,
  onOpenChange,
  isAdminHr,
  editing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  isAdminHr: boolean
  editing?: Post
}) {
  const create = useMutation(api.feed.create)
  const update = useMutation(api.feed.update)
  const generateUrl = useMutation(api.feed.generateUploadUrl)
  const departments = useQuery(api.departments.list) ?? []
  const offices = useQuery(api.offices.list) ?? []
  const people = useQuery(api.employees.directoryOptions) ?? []
  const isEdit = !!editing

  const [audience, setAudience] = React.useState<FeedAudience>("all")
  const [departmentId, setDepartmentId] = React.useState("")
  const [officeId, setOfficeId] = React.useState("")
  const [employeeIds, setEmployeeIds] = React.useState<Set<Id<"employees">>>(
    new Set(),
  )
  const [title, setTitle] = React.useState("")
  const [body, setBody] = React.useState("")
  const [youtubeUrl, setYoutubeUrl] = React.useState("")
  // Media already on the post (edit mode) + which are flagged for removal.
  const [existingMedia, setExistingMedia] = React.useState<ExistingMedia[]>([])
  const [removed, setRemoved] = React.useState<Set<Id<"_storage">>>(new Set())
  // Freshly uploaded media this session.
  const [media, setMedia] = React.useState<
    { id: Id<"_storage">; name: string }[]
  >([])
  const [isEvent, setIsEvent] = React.useState(false)
  const [eventDate, setEventDate] = React.useState("")
  const [eventEndDate, setEventEndDate] = React.useState("")
  const [eventLocation, setEventLocation] = React.useState("")
  const [pinned, setPinned] = React.useState(false)
  const [notifyByEmail, setNotifyByEmail] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  // Prefill (edit) or reset (create) whenever the dialog opens.
  React.useEffect(() => {
    if (!open) return
    setAudience(editing?.audience ?? "all")
    setDepartmentId(editing?.audienceDepartmentId ?? "")
    setOfficeId(editing?.audienceOfficeId ?? "")
    setEmployeeIds(new Set(editing?.audienceEmployeeIds ?? []))
    setTitle(editing?.title ?? "")
    setBody(editing?.body ?? "")
    setYoutubeUrl(editing?.youtubeUrl ?? "")
    setExistingMedia(editing?.media ?? [])
    setRemoved(new Set())
    setMedia([])
    setIsEvent(editing?.isEvent ?? false)
    setEventDate(editing?.eventDate ?? "")
    setEventEndDate(editing?.eventEndDate ?? "")
    setEventLocation(editing?.eventLocation ?? "")
    setPinned(editing?.pinned ?? false)
    setNotifyByEmail(false)
  }, [open, editing])

  function toggleEmployee(id: Id<"employees">) {
    setEmployeeIds((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleRemove(id: Id<"_storage">) {
    setRemoved((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    if (!title.trim()) return toast.error("Add a title.")
    if (audience === "department" && !departmentId)
      return toast.error("Choose a department.")
    if (audience === "office" && !officeId)
      return toast.error("Choose an office.")
    if (audience === "specific" && employeeIds.size === 0)
      return toast.error("Choose at least one employee.")
    if (isEvent && !eventDate) return toast.error("Pick an event date.")
    if (isEvent && eventEndDate && eventEndDate < eventDate)
      return toast.error("End date is before the start date.")

    // Final media list = kept existing + new uploads.
    const keptExisting = existingMedia.filter((m) => !removed.has(m.storageId))
    const allStorageIds = [
      ...keptExisting.map((m) => m.storageId),
      ...media.map((m) => m.id),
    ]
    const allNames = [
      ...keptExisting.map((m) => m.name),
      ...media.map((m) => m.name),
    ]

    setSaving(true)
    try {
      const common = {
        title: title.trim(),
        body,
        audience,
        audienceDepartmentId:
          audience === "department"
            ? (departmentId as Id<"departments">)
            : undefined,
        audienceOfficeId:
          audience === "office" ? (officeId as Id<"offices">) : undefined,
        audienceEmployeeIds:
          audience === "specific" ? [...employeeIds] : undefined,
        pinned,
        isEvent,
        eventDate: isEvent ? eventDate : undefined,
        eventEndDate: isEvent ? eventEndDate || undefined : undefined,
        eventLocation: isEvent ? eventLocation.trim() || undefined : undefined,
        youtubeUrl: youtubeUrl.trim() || undefined,
        mediaStorageIds: allStorageIds.length ? allStorageIds : undefined,
        mediaNames: allNames.length ? allNames : undefined,
      }
      if (isEdit) {
        await update({ postId: editing._id, ...common })
        toast.success("Post updated")
      } else {
        await create({ ...common, notifyByEmail })
        toast.success("Posted")
      }
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit post" : "Create new post"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Shared with</Label>
            <Select
              value={audience}
              onValueChange={(v) => setAudience(v as FeedAudience)}
            >
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                <SelectItem value="specific">Specific employees</SelectItem>
                {isAdminHr && (
                  <>
                    <SelectItem value="department">Department</SelectItem>
                    <SelectItem value="office">Office</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          {audience === "department" && (
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue placeholder="Choose a department" />
              </SelectTrigger>
              <SelectContent>
                {departments.map((d) => (
                  <SelectItem key={d._id} value={d._id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {audience === "office" && (
            <Select value={officeId} onValueChange={setOfficeId}>
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue placeholder="Choose an office" />
              </SelectTrigger>
              <SelectContent>
                {offices.map((o) => (
                  <SelectItem key={o._id} value={o._id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {audience === "specific" && (
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border p-2">
              {people.length === 0 ? (
                <p className="text-muted-foreground p-2 text-sm">
                  No employees to choose from.
                </p>
              ) : (
                people.map((p) => (
                  <label
                    key={p._id}
                    className="hover:bg-accent/50 flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm"
                  >
                    <Checkbox
                      checked={employeeIds.has(p._id)}
                      onCheckedChange={() => toggleEmployee(p._id)}
                    />
                    {p.name}
                  </label>
                ))
              )}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's the announcement?"
            />
          </div>

          <RichTextEditor
            value={body}
            onChange={setBody}
            placeholder="Write something…"
          />

          <div className="flex flex-col gap-1.5">
            <Label>YouTube link</Label>
            <Input
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://youtube.com/watch?v=…  (optional)"
            />
          </div>

          {/* Existing media (edit mode) */}
          {existingMedia.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {existingMedia.map((m) => {
                const flagged = removed.has(m.storageId)
                return (
                  <div
                    key={m.storageId}
                    className={cn(
                      "relative flex flex-col items-center gap-1",
                      flagged && "opacity-40",
                    )}
                  >
                    <div className="bg-muted size-24 overflow-hidden rounded-md border">
                      {m.isImage && m.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.url}
                          alt={m.name}
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="text-muted-foreground flex size-full items-center justify-center">
                          <IconPaperclip className="size-6" />
                        </div>
                      )}
                    </div>
                    <span className="max-w-24 truncate text-xs">{m.name}</span>
                    <button
                      type="button"
                      onClick={() => toggleRemove(m.storageId)}
                      className="bg-background absolute right-1 top-1 rounded-full border p-1 shadow"
                      title={flagged ? "Keep" : "Remove"}
                    >
                      {flagged ? (
                        <IconArrowBackUp className="size-3.5" />
                      ) : (
                        <IconTrash className="text-destructive size-3.5" />
                      )}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <FileUpload
                label="+ Add media / files"
                generateUrl={generateUrl}
                onUploaded={(id, file) =>
                  setMedia((m) => [...m, { id, name: file.name }])
                }
              />
              <span className="text-muted-foreground text-xs">
                {media.length} added
              </span>
            </div>
            {media.length > 0 && (
              <ul className="flex flex-col gap-1">
                {media.map((m, i) => (
                  <li
                    key={i}
                    className="text-muted-foreground flex items-center gap-1 text-xs"
                  >
                    <IconPaperclip className="size-3" />
                    <span className="truncate">{m.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setMedia((ms) => ms.filter((_, j) => j !== i))
                      }
                    >
                      <IconX className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={isEvent}
              onCheckedChange={(c) => setIsEvent(c === true)}
            />
            This is an event
          </label>
          {isEvent && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label>Start date</Label>
                <Input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>End date</Label>
                <Input
                  type="date"
                  value={eventEndDate}
                  min={eventDate || undefined}
                  onChange={(e) => setEventEndDate(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Location</Label>
                <Input
                  value={eventLocation}
                  onChange={(e) => setEventLocation(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <div className="flex flex-wrap items-center gap-4">
              {isAdminHr && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={pinned}
                    onCheckedChange={(c) => setPinned(c === true)}
                  />
                  Pin this post
                </label>
              )}
              {!isEdit && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={notifyByEmail}
                    onCheckedChange={(c) => setNotifyByEmail(c === true)}
                  />
                  Notify recipients
                  <span className="text-muted-foreground text-xs">(in-app)</span>
                </label>
              )}
            </div>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save" : "Post"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
