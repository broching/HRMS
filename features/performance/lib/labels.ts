import type {
  ReviewStatus,
  GoalStatus,
  ReviewCycleStatus,
  Feedback360Relationship,
} from "@/convex/lib/enums"

export const FEEDBACK360_RELATIONSHIPS: Feedback360Relationship[] = [
  "peer",
  "upward",
  "downward",
]

export const FEEDBACK360_RELATIONSHIP_LABELS: Record<
  Feedback360Relationship,
  string
> = {
  peer: "Peer",
  upward: "Upward",
  downward: "Downward",
  self: "Self",
}

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  self_review: "Self-appraisal",
  manager_review: "Appraiser review",
  calibration: "Calibration",
  released: "Released",
  completed: "Completed",
}

export const REVIEW_STATUS_BADGE: Record<
  ReviewStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  self_review: "secondary",
  manager_review: "secondary",
  calibration: "outline",
  released: "outline",
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
