"use client"

import * as React from "react"
import { useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import type { FunctionReturnType } from "convex/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { IconPlus, IconTrash } from "@tabler/icons-react"

type CompetencyDoc = FunctionReturnType<typeof api.competencies.list>[number]

function CompetencyForm({
  initial,
  onSubmit,
  onDone,
}: {
  initial?: CompetencyDoc
  onSubmit: (values: {
    category: string
    name: string
    description?: string
    weightPct?: number
  }) => Promise<void>
  onDone: () => void
}) {
  const [category, setCategory] = React.useState(initial?.category ?? "")
  const [name, setName] = React.useState(initial?.name ?? "")
  const [description, setDescription] = React.useState(initial?.description ?? "")
  const [weight, setWeight] = React.useState(
    initial?.weightPct != null ? String(initial.weightPct) : "",
  )
  const [saving, setSaving] = React.useState(false)

  async function handleSave() {
    if (!category.trim() || !name.trim()) {
      toast.error("Category and name are required.")
      return
    }
    setSaving(true)
    try {
      await onSubmit({
        category: category.trim(),
        name: name.trim(),
        description: description.trim() || undefined,
        weightPct: weight.trim() ? Number(weight) : undefined,
      })
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save competency.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label>Category</Label>
        <Input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. Functional Knowledge"
        />
      </div>
      <div className="grid gap-2">
        <Label>Competency</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Own your expertise"
        />
      </div>
      <div className="grid gap-2">
        <Label>Description</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Behaviour this competency describes"
          rows={3}
        />
      </div>
      <div className="grid gap-2">
        <Label>Weight (%)</Label>
        <Input
          type="number"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="e.g. 20"
          className="w-32"
        />
      </div>
      <DialogFooter>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </div>
  )
}

export function CompetencySettings() {
  const competencies = useQuery(api.competencies.list)
  const create = useMutation(api.competencies.create)
  const update = useMutation(api.competencies.update)
  const remove = useMutation(api.competencies.remove)
  const seedDefaults = useMutation(api.competencies.seedDefaults)

  const [addOpen, setAddOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<CompetencyDoc | null>(null)

  if (competencies === undefined) {
    return (
      <div className="px-4 lg:px-6">
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  // Group by category, preserving order.
  const groups: { category: string; items: CompetencyDoc[] }[] = []
  for (const c of competencies) {
    let g = groups.find((x) => x.category === c.category)
    if (!g) {
      g = { category: c.category, items: [] }
      groups.push(g)
    }
    g.items.push(c)
  }

  return (
    <div className="flex flex-col gap-4 px-4 lg:px-6">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          The competency library appraisals draw from. Grouped by category, each
          with a relative weight.
        </p>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <IconPlus className="size-4" /> Add competency
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add competency</DialogTitle>
              <DialogDescription>
                Create a competency employees are appraised against.
              </DialogDescription>
            </DialogHeader>
            <CompetencyForm
              onSubmit={async (values) => {
                await create(values)
                toast.success("Competency added.")
              }}
              onDone={() => setAddOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {competencies.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm font-medium">No competencies yet</p>
            <Button
              variant="outline"
              onClick={async () => {
                await seedDefaults()
                toast.success("Seeded the default competency set.")
              }}
            >
              Seed default competencies
            </Button>
          </CardContent>
        </Card>
      ) : (
        groups.map((g) => (
          <Card key={g.category}>
            <CardContent className="pt-6">
              <h3 className="text-primary mb-3 font-semibold">{g.category}</h3>
              <div className="flex flex-col divide-y">
                {g.items.map((c) => (
                  <div
                    key={c._id}
                    className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{c.name}</span>
                        {c.weightPct != null && (
                          <Badge variant="outline">{c.weightPct}%</Badge>
                        )}
                        {!c.active && <Badge variant="secondary">Inactive</Badge>}
                      </div>
                      {c.description && (
                        <p className="text-muted-foreground mt-1 text-sm">
                          {c.description}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(c)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={async () => {
                          await remove({ competencyId: c._id as Id<"competencies"> })
                          toast.success("Competency removed.")
                        }}
                      >
                        <IconTrash className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit competency</DialogTitle>
          </DialogHeader>
          {editing && (
            <CompetencyForm
              initial={editing}
              onSubmit={async (values) => {
                await update({
                  competencyId: editing._id as Id<"competencies">,
                  ...values,
                })
                toast.success("Competency updated.")
              }}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
