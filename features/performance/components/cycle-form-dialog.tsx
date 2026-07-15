"use client"

import * as React from "react"
import { useQuery, useMutation } from "convex/react"
import { toast } from "sonner"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import type { FunctionReturnType } from "convex/server"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { FormBuilder } from "@/features/performance/components/form-builder"
import { type CycleForm, emptyForm } from "@/features/performance/lib/form-builder-model"

type Cycle = FunctionReturnType<typeof api.reviewCycles.list>[number]

export function CycleFormDialog({
  cycle,
  onClose,
}: {
  cycle: Cycle | null
  onClose: () => void
}) {
  const templates = useQuery(
    api.appraisalFormTemplates.list,
    cycle ? {} : "skip",
  )
  const updateForm = useMutation(api.reviewCycles.updateForm)
  const saveAsTemplate = useMutation(api.reviewCycles.saveAsTemplate)

  const [form, setForm] = React.useState<CycleForm>(emptyForm())
  const [busy, setBusy] = React.useState(false)
  const isDraft = cycle?.status === "draft"

  // The template pending a "replace the form?" confirmation, and the
  // save-as-template name modal state.
  const [pendingTemplate, setPendingTemplate] = React.useState<{
    id: Id<"appraisalFormTemplates">
    name: string
    form: CycleForm
  } | null>(null)
  const [templateNameOpen, setTemplateNameOpen] = React.useState(false)
  const [templateName, setTemplateName] = React.useState("")
  const [savingTemplate, setSavingTemplate] = React.useState(false)

  React.useEffect(() => {
    if (!cycle) return
    setForm(cycle.form ?? emptyForm())
  }, [cycle])

  async function save() {
    if (!cycle) return
    setBusy(true)
    try {
      await updateForm({ cycleId: cycle._id, form })
      toast.success("Form saved")
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the form.")
    } finally {
      setBusy(false)
    }
  }

  function openSaveTemplate() {
    setTemplateName("")
    setTemplateNameOpen(true)
  }

  async function confirmSaveTemplate() {
    if (!cycle) return
    const name = templateName.trim()
    if (!name) return
    setSavingTemplate(true)
    try {
      // Persist the current edits first so the template matches what's shown.
      if (isDraft) await updateForm({ cycleId: cycle._id, form })
      await saveAsTemplate({ cycleId: cycle._id, name })
      toast.success("Saved as template")
      setTemplateNameOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save template.")
    } finally {
      setSavingTemplate(false)
    }
  }

  function loadTemplate(id: string) {
    const tpl = templates?.find((t) => t._id === (id as Id<"appraisalFormTemplates">))
    if (!tpl) return
    setPendingTemplate({ id: tpl._id, name: tpl.name, form: tpl.form })
  }

  return (
    <Dialog open={!!cycle} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92vh] w-[95vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-6 pt-6 pb-4">
          <DialogTitle>Build form · {cycle?.name}</DialogTitle>
          <DialogDescription>
            {isDraft
              ? "Design the appraisal form. Sections hold fields answered by the employee, the appraiser, or both."
              : "This cycle has been released — its form is now read-only."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 overflow-y-auto px-6 py-4">
          {isDraft && templates && templates.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Start from a template</Label>
              <Select value="" onValueChange={loadTemplate}>
                <SelectTrigger className="w-full sm:w-72">
                  <SelectValue placeholder="Load a template…" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t._id} value={t._id}>
                      {t.name}
                      {t.isSystemDefault ? " (default)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <fieldset disabled={!isDraft} className="min-w-0">
            <FormBuilder form={form} onChange={setForm} />
          </fieldset>
        </div>

        <DialogFooter className="flex-col-reverse gap-2 border-t px-6 py-4 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={openSaveTemplate}
            disabled={busy || !cycle}
          >
            Save as template
          </Button>
          {isDraft && (
            <Button onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save form"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      {/* Confirm replacing the current form with a chosen template. */}
      <ConfirmDialog
        open={!!pendingTemplate}
        onOpenChange={(o) => !o && setPendingTemplate(null)}
        title="Load template?"
        description={
          pendingTemplate
            ? `Replace the current form with the "${pendingTemplate.name}" template? This overwrites your edits.`
            : undefined
        }
        confirmLabel="Load template"
        onConfirm={() => {
          if (pendingTemplate) setForm(pendingTemplate.form)
          setPendingTemplate(null)
        }}
      />

      {/* Name + save the current form as a reusable template. */}
      <Dialog open={templateNameOpen} onOpenChange={setTemplateNameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
            <DialogDescription>
              Give this form a name so you can reuse it in future cycles.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="template-name" className="text-xs">
              Template name
            </Label>
            <Input
              id="template-name"
              value={templateName}
              autoFocus
              placeholder="e.g. Annual Review"
              onChange={(e) => setTemplateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && templateName.trim()) {
                  e.preventDefault()
                  void confirmSaveTemplate()
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setTemplateNameOpen(false)}
              disabled={savingTemplate}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmSaveTemplate}
              disabled={savingTemplate || !templateName.trim()}
            >
              {savingTemplate ? "Saving…" : "Save template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
