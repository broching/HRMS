import type { CandidateStage, JobStatus, CandidateSource } from "@/convex/lib/enums"

export const STAGE_LABELS: Record<CandidateStage, string> = {
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  kiv: "Keep in view",
  rejected: "Rejected",
}

// Stages offered in the pipeline dropdown, in order.
export const STAGE_ORDER: CandidateStage[] = [
  "applied",
  "screening",
  "interview",
  "offer",
  "hired",
  "kiv",
  "rejected",
]

export const STAGE_BADGE: Record<
  CandidateStage,
  "default" | "secondary" | "outline" | "destructive"
> = {
  applied: "secondary",
  screening: "secondary",
  interview: "default",
  offer: "default",
  hired: "default",
  kiv: "outline",
  rejected: "destructive",
}

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  draft: "Draft",
  open: "Open",
  closed: "Closed",
}

export const JOB_STATUS_BADGE: Record<
  JobStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  draft: "outline",
  open: "default",
  closed: "secondary",
}

export const SOURCE_LABELS: Record<CandidateSource, string> = {
  board: "Job board",
  manual: "Added by HR",
  referral: "Referral",
}
