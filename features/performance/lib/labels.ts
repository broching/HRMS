import type {
  ReviewStatus,
  GoalStatus,
  ReviewCycleStatus,
} from "@/convex/lib/enums"

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  self_review: "Self-review",
  manager_review: "Manager review",
  completed: "Completed",
}

export const REVIEW_STATUS_BADGE: Record<
  ReviewStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  self_review: "secondary",
  manager_review: "secondary",
  completed: "default",
}

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
}

export const GOAL_STATUS_BADGE: Record<
  GoalStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  not_started: "outline",
  in_progress: "secondary",
  completed: "default",
  cancelled: "destructive",
}

export const CYCLE_STATUS_LABELS: Record<ReviewCycleStatus, string> = {
  draft: "Draft",
  active: "Active",
  closed: "Closed",
}

export const CYCLE_STATUS_BADGE: Record<
  ReviewCycleStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  draft: "outline",
  active: "default",
  closed: "secondary",
}

export function ratingLabel(rating: number | null, max: number): string {
  return rating == null ? "—" : `${rating} / ${max}`
}
