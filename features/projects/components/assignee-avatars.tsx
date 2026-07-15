"use client"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { initials, avatarTone } from "@/features/projects/lib/task"

// Overlapping stack of assignee avatars with a "+N" overflow chip.
export function AssigneeAvatars({
  people,
  max = 4,
  size = "size-6",
}: {
  people: { employeeId: string; name: string }[]
  max?: number
  size?: string
}) {
  if (people.length === 0) return null
  const shown = people.slice(0, max)
  const extra = people.length - shown.length
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((p) => (
        <Tooltip key={p.employeeId}>
          <TooltipTrigger asChild>
            <Avatar className={cn(size, "ring-background ring-2")}>
              <AvatarFallback
                className={cn("text-[10px] font-medium", avatarTone(p.name))}
              >
                {initials(p.name)}
              </AvatarFallback>
            </Avatar>
          </TooltipTrigger>
          <TooltipContent>{p.name}</TooltipContent>
        </Tooltip>
      ))}
      {extra > 0 && (
        <Avatar className={cn(size, "ring-background ring-2")}>
          <AvatarFallback className="bg-muted text-muted-foreground text-[10px] font-medium">
            +{extra}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  )
}
