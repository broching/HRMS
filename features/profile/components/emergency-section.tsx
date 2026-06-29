"use client"

import * as React from "react"
import { useMutation } from "convex/react"
import { IconPencil, IconPlus, IconX } from "@tabler/icons-react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Field, type ProfileData } from "./profile-fields"

type Contact = { name: string; relationship?: string; phone?: string }

const t = (s?: string) => {
  const v = s?.trim()
  return v ? v : undefined
}

export function EmergencySection({ employee }: { employee: ProfileData }) {
  const update = useMutation(api.employees.updateOwnProfile)
  const [editing, setEditing] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [rows, setRows] = React.useState<Contact[]>(
    () => (employee.emergencyContacts ?? []).map((c) => ({ ...c })),
  )

  function start() {
    setRows((employee.emergencyContacts ?? []).map((c) => ({ ...c })))
    setEditing(true)
  }

  async function save() {
    setSaving(true)
    try {
      const cleaned = rows
        .filter((r) => r.name.trim())
        .map((r) => ({
          name: r.name.trim(),
          relationship: t(r.relationship),
          phone: t(r.phone),
        }))
      await update({ emergencyContacts: cleaned })
      toast.success("Emergency contacts updated")
      setEditing(false)
    } catch {
      toast.error("Could not save")
    } finally {
      setSaving(false)
    }
  }

  function setRow(i: number, key: keyof Contact, value: string) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)))
  }

  const contacts = employee.emergencyContacts ?? []

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Emergency contacts</h2>
        {employee.isSelf && !editing && (
          <Button variant="ghost" size="icon" className="size-8" onClick={start}>
            <IconPencil className="size-4" />
            <span className="sr-only">Edit emergency contacts</span>
          </Button>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-4">
          {rows.map((r, i) => (
            <div key={i} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <Cell label="Name">
                <Input value={r.name} onChange={(e) => setRow(i, "name", e.target.value)} />
              </Cell>
              <Cell label="Relationship">
                <Input
                  value={r.relationship ?? ""}
                  onChange={(e) => setRow(i, "relationship", e.target.value)}
                />
              </Cell>
              <Cell label="Phone">
                <Input value={r.phone ?? ""} onChange={(e) => setRow(i, "phone", e.target.value)} />
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
              onClick={() => setRows((rs) => [...rs, { name: "" }])}
            >
              <IconPlus className="size-4" />
              Add contact
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
      ) : contacts.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {contacts.map((c, i) => (
            <Field
              key={i}
              label={c.relationship || "Contact"}
              value={[c.name, c.phone].filter(Boolean).join(" · ")}
            />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          No emergency contact on file.
          {employee.isSelf ? " Add one via the pencil." : ""}
        </p>
      )}
    </section>
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
