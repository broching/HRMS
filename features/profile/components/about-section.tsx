"use client"

import * as React from "react"
import { useMutation } from "convex/react"
import { IconPencil } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { ProfileData } from "./profile-fields"

export function AboutSection({
  employee,
}: {
  employee: ProfileData
}) {
  const update = useMutation(api.employees.updateOwnProfile)
  const [editing, setEditing] = React.useState(false)
  const [value, setValue] = React.useState(employee.bio ?? "")
  const [saving, setSaving] = React.useState(false)

  function start() {
    setValue(employee.bio ?? "")
    setEditing(true)
  }

  async function save() {
    setSaving(true)
    try {
      await update({ bio: value.trim() })
      toast.success("About updated")
      setEditing(false)
    } catch {
      toast.error("Could not save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">About</h2>
        {employee.isSelf && !editing && (
          <Button variant="ghost" size="icon" className="size-8" onClick={start}>
            <IconPencil className="size-4" />
            <span className="sr-only">Edit about</span>
          </Button>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-3">
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={5}
            placeholder="Write a short bio about yourself…"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : employee.bio ? (
        <p className="text-sm whitespace-pre-wrap">{employee.bio}</p>
      ) : (
        <p className="text-muted-foreground text-sm">
          {employee.isSelf ? "Add a short bio about yourself." : "No bio yet."}
        </p>
      )}
    </section>
  )
}
