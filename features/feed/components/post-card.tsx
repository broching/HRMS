"use client"

import { getErrorMessage } from "@/lib/errors"
import * as React from "react"
import { useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import {
  IconCalendarEvent,
  IconDots,
  IconMapPin,
  IconPaperclip,
  IconPin,
} from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import { useCurrentMember } from "@/hooks/use-current-member"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  relativeTime,
  eventChipParts,
  formatEventDate,
  youtubeEmbedUrl,
} from "@/features/feed/lib/labels"
import { CreatePostDialog } from "./create-post-dialog"

type Post = FunctionReturnType<typeof api.feed.list>[number]

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

export function PostCard({ post }: { post: Post }) {
  const remove = useMutation(api.feed.remove)
  const togglePin = useMutation(api.feed.togglePin)
  const member = useCurrentMember()
  const isAdminHr = member?.role === "admin" || member?.role === "hr"
  const [editOpen, setEditOpen] = React.useState(false)

  const showMenu = post.canDelete || post.canEdit || post.canPin

  async function run(p: Promise<unknown>, ok: string) {
    try {
      await p
      toast.success(ok)
    } catch (e) {
      toast.error(getErrorMessage(e, "Action failed"))
    }
  }

  const chip = post.isEvent && post.eventDate ? eventChipParts(post.eventDate) : null
  const embed = youtubeEmbedUrl(post.youtubeUrl)
  const images = post.media.filter((m) => m.isImage && m.url)
  const files = post.media.filter((m) => !m.isImage)

  const eventRange =
    post.eventDate &&
    (post.eventEndDate && post.eventEndDate !== post.eventDate
      ? `${formatEventDate(post.eventDate)} – ${formatEventDate(post.eventEndDate)}`
      : formatEventDate(post.eventDate))

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar className="size-9">
            <AvatarImage src={post.authorPhotoUrl ?? undefined} alt={post.authorName} />
            <AvatarFallback className="text-xs">
              {initials(post.authorName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="flex items-center gap-2 text-sm font-medium">
              {post.authorName}
              {post.pinned && <IconPin className="text-primary size-3.5" />}
            </span>
            <span className="text-muted-foreground text-xs">
              {relativeTime(post._creationTime)}
            </span>
          </div>
          {post.audience !== "all" && (
            <Badge variant="secondary" className="ml-1 text-[10px]">
              {post.audienceLabel}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {chip && (
            <div className="bg-primary/10 text-primary flex flex-col items-center rounded-md px-2.5 py-1 leading-none">
              <span className="text-sm font-bold">{chip.day}</span>
              <span className="text-[10px] font-medium">{chip.month}</span>
            </div>
          )}
          {showMenu && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7">
                  <IconDots className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {post.canEdit && (
                  <DropdownMenuItem onClick={() => setEditOpen(true)}>
                    Edit
                  </DropdownMenuItem>
                )}
                {post.canPin && (
                  <DropdownMenuItem
                    onClick={() =>
                      run(
                        togglePin({ postId: post._id, pinned: !post.pinned }),
                        post.pinned ? "Unpinned" : "Pinned",
                      )
                    }
                  >
                    {post.pinned ? "Unpin" : "Pin"}
                  </DropdownMenuItem>
                )}
                {post.canDelete && (
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => run(remove({ postId: post._id }), "Deleted")}
                  >
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="font-semibold">{post.title}</h3>
        {post.body && (
          <div
            className="prose prose-sm dark:prose-invert text-muted-foreground max-w-none"
            // Sanitised server-side in convex/feed.ts before storage.
            dangerouslySetInnerHTML={{ __html: post.body }}
          />
        )}
      </div>

      {(eventRange || post.eventLocation) && (
        <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-xs">
          {eventRange && (
            <span className="flex items-center gap-1">
              <IconCalendarEvent className="size-3.5" /> {eventRange}
            </span>
          )}
          {post.eventLocation && (
            <span className="flex items-center gap-1">
              <IconMapPin className="size-3.5" /> {post.eventLocation}
            </span>
          )}
        </div>
      )}

      {embed && (
        <div className="aspect-video w-full overflow-hidden rounded-lg border">
          <iframe
            src={embed}
            title="YouTube video"
            className="size-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      {images.length > 0 && (
        <div
          className={cn(
            "grid gap-2",
            images.length > 1 && "sm:grid-cols-2",
          )}
        >
          {images.map((m) => (
            <a
              key={m.storageId}
              href={m.url ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="bg-muted block overflow-hidden rounded-lg border"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={m.url ?? ""}
                alt={m.name}
                className={cn(
                  "w-full object-cover",
                  images.length === 1 ? "max-h-[28rem]" : "h-64",
                )}
              />
            </a>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {files.map((m) => (
            <a
              key={m.storageId}
              href={m.url ?? "#"}
              target="_blank"
              rel="noreferrer"
              className="hover:bg-accent/40 flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <IconPaperclip className="text-muted-foreground size-4" />
              <span className="max-w-[12rem] truncate">{m.name}</span>
            </a>
          ))}
        </div>
      )}

      {post.canEdit && (
        <CreatePostDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          isAdminHr={isAdminHr}
          editing={post}
        />
      )}
    </Card>
  )
}
