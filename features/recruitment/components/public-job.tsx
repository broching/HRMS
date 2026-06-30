"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import {
  IconMapPin,
  IconArrowLeft,
  IconUpload,
  IconCircleCheck,
} from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"

export function PublicJob({
  slug,
  jobId,
}: {
  slug: string
  jobId: Id<"jobs">
}) {
  const job = useQuery(api.board.getJob, { slug, jobId })
  const uploadUrl = useMutation(api.board.uploadUrl)
  const apply = useMutation(api.board.apply)

  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [phone, setPhone] = React.useState("")
  const [coverLetter, setCoverLetter] = React.useState("")
  const [resumeId, setResumeId] = React.useState<Id<"_storage"> | undefined>()
  const [resumeName, setResumeName] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [done, setDone] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  if (job === undefined) {
    return (
      <div className="text-muted-foreground flex min-h-svh items-center justify-center">
        Loading…
      </div>
    )
  }
  if (job === null) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3">
        <h1 className="text-xl font-semibold">Position not available</h1>
        <Button asChild variant="outline">
          <Link href={`/boards/${slug}`}>Back to careers</Link>
        </Button>
      </div>
    )
  }

  async function onResume(file: File) {
    try {
      const url = await uploadUrl({ slug })
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      })
      const json = (await res.json()) as { storageId: Id<"_storage"> }
      setResumeId(json.storageId)
      setResumeName(file.name)
    } catch {
      toast.error("Couldn't upload your resume")
    }
  }

  async function submit() {
    setBusy(true)
    try {
      await apply({
        slug,
        jobId,
        name,
        email,
        phone: phone || undefined,
        resumeStorageId: resumeId,
        coverLetter: coverLetter || undefined,
      })
      setDone(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't submit application")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-background min-h-svh">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link href={`/boards/${slug}`}>
            <IconArrowLeft className="size-4" />
            All openings
          </Link>
        </Button>

        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold">{job.title}</h1>
          <div className="text-muted-foreground flex flex-wrap items-center gap-4 text-sm">
            {job.departmentName && <span>{job.departmentName}</span>}
            {job.level && <span>· {job.level}</span>}
            {job.country && (
              <span className="flex items-center gap-1">
                <IconMapPin className="size-4" />
                {job.country}
              </span>
            )}
          </div>
        </div>

        {job.description && (
          <div className="text-muted-foreground mt-6 whitespace-pre-line text-sm leading-relaxed">
            {job.description}
          </div>
        )}

        <Card className="mt-8">
          <CardContent className="py-6">
            {done ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <IconCircleCheck className="size-10 text-green-600" />
                <h2 className="text-lg font-semibold">Application received</h2>
                <p className="text-muted-foreground text-sm">
                  Thanks for applying to {job.title} at {job.companyName}. We&apos;ll
                  be in touch.
                </p>
                <Button asChild variant="outline" className="mt-2">
                  <Link href={`/boards/${slug}`}>View more openings</Link>
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <h2 className="text-lg font-semibold">Apply for this role</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ap-name">Full name *</Label>
                    <Input
                      id="ap-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ap-email">Email *</Label>
                    <Input
                      id="ap-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ap-phone">Phone</Label>
                    <Input
                      id="ap-phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Resume</Label>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="justify-start font-normal"
                    >
                      <IconUpload className="size-4" />
                      {resumeName || "Upload file"}
                    </Button>
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".pdf,.doc,.docx"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) onResume(f)
                        e.target.value = ""
                      }}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ap-cover">Cover letter</Label>
                  <Textarea
                    id="ap-cover"
                    rows={5}
                    value={coverLetter}
                    onChange={(e) => setCoverLetter(e.target.value)}
                    placeholder="Tell us why you're a great fit…"
                  />
                </div>
                <Button
                  onClick={submit}
                  disabled={busy || !name.trim() || !email.trim()}
                  className="w-fit"
                >
                  {busy ? "Submitting…" : "Submit application"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
