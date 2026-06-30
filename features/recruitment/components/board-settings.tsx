"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import { IconUpload, IconExternalLink } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

function ImageField({
  label,
  url,
  aspect,
  onPick,
  onClear,
}: {
  label: string
  url: string | null
  aspect: string
  onPick: (file: File) => void
  onClear: () => void
}) {
  const ref = React.useRef<HTMLInputElement>(null)
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-3">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={label}
            className={`${aspect} rounded-lg border object-cover`}
          />
        ) : (
          <div
            className={`${aspect} bg-muted text-muted-foreground flex items-center justify-center rounded-lg border text-xs`}
          >
            None
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => ref.current?.click()}>
            <IconUpload className="size-4" />
            Upload
          </Button>
          {url && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              Remove
            </Button>
          )}
        </div>
        <input
          ref={ref}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onPick(f)
            e.target.value = ""
          }}
        />
      </div>
    </div>
  )
}

export function BoardSettings() {
  const data = useQuery(api.recruitment.getBoardSettings)
  const save = useMutation(api.recruitment.saveBoardSettings)
  const generateUploadUrl = useMutation(api.recruitment.generateUploadUrl)

  const [slug, setSlug] = React.useState("")
  const [companyName, setCompanyName] = React.useState("")
  const [headline, setHeadline] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [published, setPublished] = React.useState(false)
  // Local preview + pending storage ids (null = cleared, undefined = unchanged).
  const [logoUrl, setLogoUrl] = React.useState<string | null>(null)
  const [bannerUrl, setBannerUrl] = React.useState<string | null>(null)
  const [logoId, setLogoId] = React.useState<Id<"_storage"> | null | undefined>(undefined)
  const [bannerId, setBannerId] = React.useState<Id<"_storage"> | null | undefined>(undefined)
  const [busy, setBusy] = React.useState(false)
  const init = React.useRef(false)

  React.useEffect(() => {
    if (data && !init.current) {
      init.current = true
      setSlug(data.slug)
      setCompanyName(data.companyName)
      setHeadline(data.headline ?? "")
      setDescription(data.description ?? "")
      setPublished(data.published)
      setLogoUrl(data.logoUrl)
      setBannerUrl(data.bannerUrl)
    }
  }, [data])

  if (data === undefined) {
    return (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  async function upload(file: File): Promise<Id<"_storage">> {
    const url = await generateUploadUrl()
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    })
    const json = (await res.json()) as { storageId: Id<"_storage"> }
    return json.storageId
  }

  async function pickLogo(file: File) {
    try {
      const id = await upload(file)
      setLogoId(id)
      setLogoUrl(URL.createObjectURL(file))
    } catch {
      toast.error("Upload failed")
    }
  }
  async function pickBanner(file: File) {
    try {
      const id = await upload(file)
      setBannerId(id)
      setBannerUrl(URL.createObjectURL(file))
    } catch {
      toast.error("Upload failed")
    }
  }

  async function onSave() {
    setBusy(true)
    try {
      await save({
        slug,
        companyName,
        headline: headline.trim() || undefined,
        description: description.trim() || undefined,
        logoStorageId: logoId,
        bannerStorageId: bannerId,
        published,
      })
      toast.success("Board settings saved")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save settings")
    } finally {
      setBusy(false)
    }
  }

  const publicLink =
    typeof window !== "undefined" ? `${window.location.origin}/boards/${slug}` : ""

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <Card>
        <CardContent className="flex flex-col gap-5 py-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Publish job board</p>
              <p className="text-muted-foreground text-sm">
                When published, open jobs marked “Post to job board” appear on your
                public careers page.
              </p>
            </div>
            <Switch checked={published} onCheckedChange={setPublished} />
          </div>

          {published && (
            <a
              href={publicLink}
              target="_blank"
              rel="noreferrer"
              className="text-primary inline-flex w-fit items-center gap-1 text-sm hover:underline"
            >
              <IconExternalLink className="size-4" />
              {publicLink}
            </a>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="b-company">Company name</Label>
              <Input
                id="b-company"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="b-slug">Board link (slug)</Label>
              <Input
                id="b-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="my-company"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="b-headline">Headline</Label>
            <Input
              id="b-headline"
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
              placeholder="Careers at Acme"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="b-desc">About the company</Label>
            <Textarea
              id="b-desc"
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell candidates what your company does and why they'd love working here."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <ImageField
              label="Logo"
              url={logoUrl}
              aspect="size-20"
              onPick={pickLogo}
              onClear={() => {
                setLogoId(null)
                setLogoUrl(null)
              }}
            />
            <ImageField
              label="Banner"
              url={bannerUrl}
              aspect="h-20 w-40"
              onPick={pickBanner}
              onClear={() => {
                setBannerId(null)
                setBannerUrl(null)
              }}
            />
          </div>
        </CardContent>
      </Card>

      <div>
        <Button onClick={onSave} disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </div>
  )
}
