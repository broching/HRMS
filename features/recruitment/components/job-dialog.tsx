"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { EmploymentType, JobStatus } from "@/convex/lib/enums"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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

type Job = FunctionReturnType<typeof api.recruitment.listJobs>[number]

const NONE = "none"
const EMPLOYMENT_TYPES: { value: EmploymentType; label: string }[] = [
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
  { value: "contract", label: "Contract" },
  { value: "intern", label: "Intern" },
]

export function JobDialog({
  job,
  open,
  onOpenChange,
}: {
  job?: Job
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const createJob = useMutation(api.recruitment.createJob)
  const updateJob = useMutation(api.recruitment.updateJob)
  const departments = useQuery(api.departments.list) ?? []
  const employees = useQuery(api.employees.list, {}) ?? []
  const members = useQuery(api.members.list) ?? []

  const [title, setTitle] = React.useState("")
  const [departmentId, setDepartmentId] = React.useState<string>(NONE)
  const [level, setLevel] = React.useState("")
  const [country, setCountry] = React.useState("")
  const [empType, setEmpType] = React.useState<string>(NONE)
  const [status, setStatus] = React.useState<JobStatus>("open")
  const [managerId, setManagerId] = React.useState<string>(NONE)
  const [recruiterId, setRecruiterId] = React.useState<string>(NONE)
  const [description, setDescription] = React.useState("")
  const [postedToBoard, setPostedToBoard] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  // Prefill on open.
  React.useEffect(() => {
    if (!open) return
    setTitle(job?.title ?? "")
    setDepartmentId(job?.departmentId ?? NONE)
    setLevel(job?.level ?? "")
    setCountry(job?.country ?? "")
    setEmpType(job?.employmentType ?? NONE)
    setStatus(job?.status ?? "open")
    setManagerId(job?.hiringManagerEmployeeId ?? NONE)
    setRecruiterId(job?.recruiterUserId ?? NONE)
    setDescription(job?.description ?? "")
    setPostedToBoard(job?.postedToBoard ?? false)
  }, [open, job])

  async function submit() {
    setBusy(true)
    try {
      if (!title.trim()) throw new Error("Enter a job title.")
      const common = {
        title: title.trim(),
        departmentId:
          departmentId === NONE ? undefined : (departmentId as Id<"departments">),
        level: level.trim() || undefined,
        country: country.trim() || undefined,
        employmentType: empType === NONE ? undefined : (empType as EmploymentType),
        description: description.trim() || undefined,
        hiringManagerEmployeeId:
          managerId === NONE ? undefined : (managerId as Id<"employees">),
        recruiterUserId:
          recruiterId === NONE ? undefined : (recruiterId as Id<"users">),
        status,
        postedToBoard,
      }
      if (job) {
        await updateJob({
          jobId: job._id,
          ...common,
          departmentId: common.departmentId ?? null,
          level: common.level ?? null,
          country: common.country ?? null,
          employmentType: common.employmentType ?? null,
          description: common.description ?? null,
          hiringManagerEmployeeId: common.hiringManagerEmployeeId ?? null,
          recruiterUserId: common.recruiterUserId ?? null,
        })
        toast.success("Job updated")
      } else {
        await createJob(common)
        toast.success("Job created")
      }
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save job")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{job ? "Edit job" : "Add new job"}</DialogTitle>
          <DialogDescription>
            Posting a job to the board makes it visible on your public careers page.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="job-title">Job title</Label>
            <Input
              id="job-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Sales Consultant"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Department</Label>
              <Select value={departmentId} onValueChange={setDepartmentId}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d._id} value={d._id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Employment type</Label>
              <Select value={empType} onValueChange={setEmpType}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {EMPLOYMENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="job-level">Level</Label>
              <Input
                id="job-level"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                placeholder="e.g. Mid Senior level"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="job-country">Location</Label>
              <Input
                id="job-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="e.g. Singapore"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Hiring manager</Label>
              <Select value={managerId} onValueChange={setManagerId}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e._id} value={e._id}>
                      {e.preferredName ?? e.firstName} {e.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Recruiter</Label>
              <Select value={recruiterId} onValueChange={setRecruiterId}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="job-desc">Description</Label>
            <Textarea
              id="job-desc"
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Role overview, responsibilities, requirements…"
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as JobStatus)}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={postedToBoard} onCheckedChange={setPostedToBoard} />
              Post to job board
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {job ? "Save changes" : "Create job"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
