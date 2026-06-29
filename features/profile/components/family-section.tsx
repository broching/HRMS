"use client"

import * as React from "react"
import { useMutation } from "convex/react"
import { IconPencil, IconPlus, IconX } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Field, type ProfileData } from "./profile-fields"
import { EmergencySection } from "./emergency-section"

type Member = {
  id: string
  name: string
  relationship?: string
  dob?: string
  contact?: string
}

const t = (s?: string) => {
  const v = s?.trim()
  return v ? v : undefined
}

export function FamilySection({ employee }: { employee: ProfileData }) {
  const update = useMutation(api.employees.updateOwnProfile)
  const [editing, setEditing] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [rows, setRows] = React.useState<Member[]>(
    () => (employee.familyMembers ?? []).map((m) => ({ ...m })),
  )

  function start() {
    setRows((employee.familyMembers ?? []).map((m) => ({ ...m })))
    setEditing(true)
  }

  function setRow(i: number, key: keyof Member, value: string) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)))
  }

  async function save() {
    setSaving(true)
    try {
      const cleaned = rows
        .filter((r) => r.name.trim())
        .map((r) => ({
          id: r.id || crypto.randomUUID(),
          name: r.name.trim(),
          relationship: t(r.relationship),
          dob: t(r.dob),
          contact: t(r.contact),
        }))
      await update({ familyMembers: cleaned })
      toast.success("Family details updated")
      setEditing(false)
    } catch {
      toast.error("Could not save")
    } finally {
      setSaving(false)
    }
  }

  const members = employee.familyMembers ?? []

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Family members</h2>
          {employee.isSelf && !editing && (
            <Button variant="ghost" size="icon" className="size-8" onClick={start}>
              <IconPencil className="size-4" />
              <span className="sr-only">Edit family members</span>
            </Button>
          )}
        </div>

        {editing ? (
          <div className="flex flex-col gap-4">
            {rows.map((r, i) => (
              <div key={i} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
                <Cell label="Name">
                  <Input value={r.name} onChange={(e) => setRow(i, "name", e.target.value)} />
                </Cell>
                <Cell label="Relationship">
                  <Input
                    value={r.relationship ?? ""}
                    onChange={(e) => setRow(i, "relationship", e.target.value)}
                  />
                </Cell>
                <Cell label="Date of birth">
                  <Input
                    type="date"
                    value={r.dob ?? ""}
                    onChange={(e) => setRow(i, "dob", e.target.value)}
                  />
                </Cell>
                <Cell label="Contact">
                  <Input
                    value={r.contact ?? ""}
                    onChange={(e) => setRow(i, "contact", e.target.value)}
                  />
                </Cell>
                <button
                  type="button"
                  onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}
                  className="text-muted-foreground hover:text-destructive self-end pb-2.5"
                >
                  <IconX className="size-4" />
                </button>
              </div>
            ))}
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRows((rs) => [...rs, { id: "", name: "" }])}
              >
                <IconPlus className="size-4" />
                Add family member
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        ) : members.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {members.map((m) => (
              <Field
                key={m.id}
                label={m.relationship || "Family member"}
                value={[m.name, m.dob, m.contact].filter(Boolean).join(" · ")}
              />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            No family members on file.
            {employee.isSelf ? " Add one via the pencil." : ""}
          </p>
        )}
      </section>

      <Separator />

      {/* Emergency contacts now live under Family Details. */}
      <EmergencySection employee={employee} />
    </div>
  )
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-muted-foreground text-xs uppercase">{label}</Label>
      {children}
    </div>
  )
}
