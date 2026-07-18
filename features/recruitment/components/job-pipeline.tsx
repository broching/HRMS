"use client"

import { getErrorMessage } from "@/lib/errors"
import * as React from "react"
import Link from "next/link"
import { useQuery, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { toast } from "sonner"
import {
  IconArrowLeft,
  IconCalendarPlus,
  IconExternalLink,
  IconDotsVertical,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { CandidateStage } from "@/convex/lib/enums"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PageHeader } from "@/components/shared/page-header"
import {
  STAGE_LABELS,
  STAGE_ORDER,
  SOURCE_LABELS,
  JOB_STATUS_LABELS,
  JOB_STATUS_BADGE,
} from "@/features/recruitment/lib/labels"
import { AddCandidateDialog } from "./add-candidate-dialog"
import { ScheduleInterviewDialog } from "./schedule-interview-dialog"

type Candidate = FunctionReturnType<typeof api.recruitment.listCandidates>[number]

// Columns shown on the board (rejected kept last as an outcome lane).
const COLUMNS: CandidateStage[] = [
  "applied",
  "screening",
  "interview",
  "offer",
  "hired",
  "kiv",
  "rejected",
]

function CandidateCard({
  c,
  onSchedule,
}: {
  c: Candidate
  onSchedule: (c: Candidate) => void
}) {
  const setStage = useMutation(api.recruitment.setCandidateStage)
  async function move(stage: CandidateStage) {
    try {
      await setStage({ candidateId: c._id, stage })
    } catch (e) {
      toast.error(getErrorMessage(e, "Move failed"))
    }
  }
  return (
    <div className="bg-background flex flex-col gap-2 rounded-lg border p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{c.name}</p>
          <p className="text-muted-foreground truncate text-xs">{c.email}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7 shrink-0">
              <IconDotsVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Move to</DropdownMenuLabel>
            {STAGE_ORDER.filter((s) => s !== c.stage).map((s) => (
              <DropdownMenuItem key={s} onClick={() => move(s)}>
                {STAGE_LABELS[s]}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onSchedule(c)}>
              Schedule interview…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-[10px]">
          {SOURCE_LABELS[c.source]}
        </Badge>
        {c.resumeUrl && (
          <a
            href={c.resumeUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary inline-flex items-center gap-0.5 text-xs hover:underline"
          >
            <IconExternalLink className="size-3" />
            Resume
          </a>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-7 justify-center"
        onClick={() => onSchedule(c)}
      >
        <IconCalendarPlus className="size-3.5" />
        Interview
      </Button>
    </div>
  )
}

export function JobPipeline({ jobId }: { jobId: Id<"jobs"> }) {
  const job = useQuery(api.recruitment.getJob, { jobId })
  const candidates = useQuery(api.recruitment.listCandidates, { jobId })
  const [addOpen, setAddOpen] = React.useState(false)
  const [scheduleFor, setScheduleFor] = React.useState<Candidate | null>(null)

  if (job === undefined) {
    return (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (job === null) {
    return (
      <div className="px-4 lg:px-6">
        <p className="text-muted-foreground text-sm">Job not found.</p>
      </div>
    )
  }

  const byStage = new Map<CandidateStage, Candidate[]>()
  for (const s of COLUMNS) byStage.set(s, [])
  for (const c of candidates ?? []) byStage.get(c.stage)?.push(c)

  return (
    <div className="flex flex-col gap-4">
      <div className="px-4 lg:px-6">
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link href="/hr-lounge/recruitment">
            <IconArrowLeft className="size-4" />
            Recruitment
          </Link>
        </Button>
      </div>
      <PageHeader
        title={job.title}
        description={[job.departmentName, job.level, job.country]
          .filter(Boolean)
          .join(" · ")}
      >
        <Badge variant={JOB_STATUS_BADGE[job.status]}>
          {JOB_STATUS_LABELS[job.status]}
        </Badge>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          Add candidate
        </Button>
      </PageHeader>

      <div className="flex gap-3 overflow-x-auto px-4 pb-4 lg:px-6">
        {COLUMNS.map((stage) => {
          const list = byStage.get(stage) ?? []
          return (
            <div key={stage} className="bg-muted/40 flex w-64 shrink-0 flex-col gap-3 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{STAGE_LABELS[stage]}</span>
                <Badge variant="secondary">{list.length}</Badge>
              </div>
              <div className="flex flex-col gap-2">
                {candidates === undefined ? (
                  <Skeleton className="h-16 w-full" />
                ) : list.length === 0 ? (
                  <p className="text-muted-foreground py-2 text-center text-xs">
                    —
                  </p>
                ) : (
                  list.map((c) => (
                    <CandidateCard key={c._id} c={c} onSchedule={setScheduleFor} />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      <AddCandidateDialog
        jobId={job._id}
        jobTitle={job.title}
        open={addOpen}
        onOpenChange={setAddOpen}
      />
      {scheduleFor && (
        <ScheduleInterviewDialog
          candidateId={scheduleFor._id}
          candidateName={scheduleFor.name}
          open={scheduleFor !== null}
          onOpenChange={(o) => !o && setScheduleFor(null)}
        />
      )}
    </div>
  )
}
