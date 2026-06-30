"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { toast } from "sonner"
import {
  IconSearch,
  IconPlus,
  IconPencil,
  IconExternalLink,
  IconCopy,
  IconUserSearch,
  IconUsers,
  IconThumbUp,
  IconCoffee,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { CandidateStage, JobStatus } from "@/convex/lib/enums"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  STAGE_LABELS,
  STAGE_ORDER,
  STAGE_BADGE,
  JOB_STATUS_LABELS,
  SOURCE_LABELS,
} from "@/features/recruitment/lib/labels"
import { JobDialog } from "./job-dialog"
import { AddCandidateDialog } from "./add-candidate-dialog"

type Job = FunctionReturnType<typeof api.recruitment.listJobs>[number]

function initials(name: string | null) {
  if (!name) return "?"
  const [a, b] = name.split(" ")
  return `${a?.[0] ?? ""}${b?.[0] ?? ""}`.toUpperCase()
}

const ALL = "all"

function StatCard({
  icon,
  label,
  count,
  className,
}: {
  icon: React.ReactNode
  label: string
  count: number
  className: string
}) {
  return (
    <div className={`flex items-center gap-3 rounded-xl p-4 text-white ${className}`}>
      <span className="flex size-11 items-center justify-center rounded-lg bg-white/20">
        {icon}
      </span>
      <div>
        <p className="text-xs font-medium tracking-wide uppercase opacity-90">
          {label}
        </p>
        <p className="text-lg font-semibold">
          {count} <span className="text-sm font-normal opacity-90">
            {count === 1 ? "Candidate" : "Candidates"}
          </span>
        </p>
      </div>
    </div>
  )
}

function JobBoardCard({
  board,
}: {
  board: FunctionReturnType<typeof api.recruitment.dashboard>["board"]
}) {
  const link =
    board.slug && typeof window !== "undefined"
      ? `${window.location.origin}/boards/${board.slug}`
      : null
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex items-center justify-between">
          <span className="font-medium">Job Board</span>
          {link && board.published && (
            <a href={link} target="_blank" rel="noreferrer">
              <IconExternalLink className="text-muted-foreground size-4" />
            </a>
          )}
        </div>
        {board.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={board.logoUrl}
            alt={board.companyName}
            className="size-20 rounded-lg object-cover"
          />
        ) : (
          <div className="bg-muted flex size-20 items-center justify-center rounded-lg text-sm font-semibold">
            {initials(board.companyName)}
          </div>
        )}
        {link && board.published ? (
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => {
              navigator.clipboard.writeText(link)
              toast.success("Board link copied")
            }}
          >
            <IconCopy className="size-4" />
            Copy link
          </Button>
        ) : (
          <p className="text-muted-foreground text-xs">
            Publish your board in Settings to share it.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function OpenJobsTab() {
  const updateJob = useMutation(api.recruitment.updateJob)
  const [status, setStatus] = React.useState<string>("open")
  const [search, setSearch] = React.useState("")
  const jobs = useQuery(api.recruitment.listJobs, {
    status: status as JobStatus | "all",
    search: search || undefined,
  })
  const [editing, setEditing] = React.useState<Job | undefined>(undefined)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [addTo, setAddTo] = React.useState<Job | null>(null)

  async function patch(jobId: Id<"jobs">, p: Record<string, unknown>) {
    try {
      await updateJob({ jobId, ...p })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => {
            setEditing(undefined)
            setDialogOpen(true)
          }}
        >
          <IconPlus className="size-4" />
          Add new job
        </Button>
        <div className="relative max-w-xs flex-1">
          <IconSearch className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search jobs"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-muted-foreground text-sm">Status</span>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job title</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Hiring manager</TableHead>
              <TableHead>Recruiter</TableHead>
              <TableHead>Applicants</TableHead>
              <TableHead>Job board</TableHead>
              <TableHead className="text-right">{""}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs === undefined ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-8 text-center">
                  No jobs yet.
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((j) => (
                <TableRow key={j._id}>
                  <TableCell>
                    <Link
                      href={`/hr-lounge/recruitment/jobs/${j._id}`}
                      className="font-medium hover:underline"
                    >
                      {j.title}
                    </Link>
                    {j.level && (
                      <div className="text-muted-foreground text-xs">{j.level}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={j.status}
                      onValueChange={(v) => patch(j._id, { status: v })}
                    >
                      <SelectTrigger className="h-8 w-28">
                        <SelectValue>{JOB_STATUS_LABELS[j.status]}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {j.hiringManagerName ? (
                      <Avatar className="size-7">
                        <AvatarImage src={j.hiringManagerPhotoUrl ?? undefined} />
                        <AvatarFallback className="text-[10px]">
                          {initials(j.hiringManagerName)}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {j.recruiterName ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="tabular-nums">{j.applicantCount}</TableCell>
                  <TableCell>
                    <Switch
                      checked={j.postedToBoard}
                      onCheckedChange={(c) => patch(j._id, { postedToBoard: c })}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAddTo(j)}
                      >
                        Add candidate
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => {
                          setEditing(j)
                          setDialogOpen(true)
                        }}
                      >
                        <IconPencil className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <JobDialog job={editing} open={dialogOpen} onOpenChange={setDialogOpen} />
      {addTo && (
        <AddCandidateDialog
          jobId={addTo._id}
          jobTitle={addTo.title}
          open={addTo !== null}
          onOpenChange={(o) => !o && setAddTo(null)}
        />
      )}
    </div>
  )
}

function AllCandidatesTab() {
  const setStage = useMutation(api.recruitment.setCandidateStage)
  const [stage, setStageFilter] = React.useState<string>(ALL)
  const [search, setSearch] = React.useState("")
  const candidates = useQuery(api.recruitment.listCandidates, {
    stage: stage as CandidateStage | "all",
    search: search || undefined,
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <IconSearch className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search candidates"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={stage} onValueChange={setStageFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All stages</SelectItem>
            {STAGE_ORDER.map((s) => (
              <SelectItem key={s} value={s}>
                {STAGE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Candidate</TableHead>
              <TableHead>Job</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead className="text-right">Resume</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {candidates === undefined ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <Skeleton className="h-6 w-full" />
                </TableCell>
              </TableRow>
            ) : candidates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                  No candidates yet.
                </TableCell>
              </TableRow>
            ) : (
              candidates.map((c) => (
                <TableRow key={c._id}>
                  <TableCell>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-muted-foreground text-xs">{c.email}</div>
                  </TableCell>
                  <TableCell className="text-sm">{c.jobTitle}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{SOURCE_LABELS[c.source]}</Badge>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={c.stage}
                      onValueChange={(v) =>
                        setStage({ candidateId: c._id, stage: v as CandidateStage }).catch(
                          (e) =>
                            toast.error(
                              e instanceof Error ? e.message : "Update failed",
                            ),
                        )
                      }
                    >
                      <SelectTrigger className="h-8 w-36">
                        <SelectValue>
                          <Badge variant={STAGE_BADGE[c.stage]}>
                            {STAGE_LABELS[c.stage]}
                          </Badge>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {STAGE_ORDER.map((s) => (
                          <SelectItem key={s} value={s}>
                            {STAGE_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    {c.resumeUrl ? (
                      <a
                        href={c.resumeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
                      >
                        <IconExternalLink className="size-3.5" />
                        View
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

const MODE_LABEL = { video: "Video call", onsite: "On-site", phone: "Phone" } as const

function TodaySchedule() {
  const { fromMs, toMs } = React.useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date()
    end.setHours(23, 59, 59, 999)
    return { fromMs: start.getTime(), toMs: end.getTime() }
  }, [])
  const interviews = useQuery(api.recruitment.listInterviews, {
    fromMs,
    toMs,
    scheduledOnly: true,
  })

  return (
    <Card className="lg:col-span-2">
      <CardContent className="py-4">
        <p className="font-medium">Today&apos;s schedule</p>
        {interviews === undefined ? (
          <Skeleton className="mt-4 h-12 w-full" />
        ) : interviews.length === 0 ? (
          <p className="text-muted-foreground mt-4 text-sm">No event for today.</p>
        ) : (
          <div className="mt-3 flex flex-col divide-y">
            {interviews.map((iv) => (
              <div key={iv._id} className="flex items-center gap-3 py-2.5">
                <span className="tabular-nums text-sm font-medium">
                  {new Date(iv.scheduledAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {iv.candidateName}{" "}
                    <span className="text-muted-foreground">· {iv.jobTitle}</span>
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {MODE_LABEL[iv.mode]}
                    {iv.interviewerName ? ` · ${iv.interviewerName}` : ""}
                    {iv.locationOrLink ? ` · ${iv.locationOrLink}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function RecruitmentDashboard() {
  const summary = useQuery(api.recruitment.dashboard)

  return (
    <div className="flex flex-col gap-6 px-4 lg:px-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<IconUserSearch className="size-5" />}
          label="Screening"
          count={summary?.counts.screening ?? 0}
          className="bg-violet-500"
        />
        <StatCard
          icon={<IconUsers className="size-5" />}
          label="Interview"
          count={summary?.counts.interview ?? 0}
          className="bg-sky-500"
        />
        <StatCard
          icon={<IconThumbUp className="size-5" />}
          label="Offer"
          count={summary?.counts.offer ?? 0}
          className="bg-teal-500"
        />
        <StatCard
          icon={<IconCoffee className="size-5" />}
          label="Keep in view"
          count={summary?.counts.kiv ?? 0}
          className="bg-slate-500"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <TodaySchedule />
        {summary && <JobBoardCard board={summary.board} />}
      </div>

      <Tabs defaultValue="jobs" className="gap-4">
        <TabsList>
          <TabsTrigger value="jobs">Open jobs</TabsTrigger>
          <TabsTrigger value="candidates">All candidates</TabsTrigger>
        </TabsList>
        <TabsContent value="jobs">
          <OpenJobsTab />
        </TabsContent>
        <TabsContent value="candidates">
          <AllCandidatesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
