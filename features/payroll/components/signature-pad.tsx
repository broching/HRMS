"use client"

import * as React from "react"
import { toast } from "sonner"
import { useQuery, useMutation } from "convex/react"
import { IconTrash } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { getErrorMessage } from "@/lib/errors"

type Mode = "saved" | "draw" | "type"

/**
 * Capture a signature (pick a saved one, draw on a canvas, or type a name),
 * upload it as a PNG via `getUploadUrl`, and hand the resulting storageId to
 * `onSigned`. Users may save the signature they draw/type for reuse; saved
 * signatures are loaded from `api.savedSignatures` and shared across every
 * place this dialog is used.
 */
export function SignatureCaptureDialog({
  open,
  onOpenChange,
  title = "Add your signature",
  description,
  confirmLabel = "Sign",
  getUploadUrl,
  onSigned,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  confirmLabel?: string
  getUploadUrl: () => Promise<string>
  onSigned: (storageId: string) => Promise<void>
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const [mode, setMode] = React.useState<Mode>("draw")
  const [typed, setTyped] = React.useState("")
  const [hasDrawing, setHasDrawing] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [saveIt, setSaveIt] = React.useState(false)
  const [saveLabel, setSaveLabel] = React.useState("")
  const [selectedSaved, setSelectedSaved] =
    React.useState<Id<"savedSignatures"> | null>(null)
  const drawing = React.useRef(false)

  const saved = useQuery(api.savedSignatures.list, open ? {} : "skip")
  const saveSignature = useMutation(api.savedSignatures.save)
  const removeSignature = useMutation(api.savedSignatures.remove)
  const hasSaved = (saved?.length ?? 0) > 0

  // Reset on open. Default to the Saved tab when the user has any.
  React.useEffect(() => {
    if (open) {
      setTyped("")
      setHasDrawing(false)
      setSaveIt(false)
      setSaveLabel("")
      setSelectedSaved(null)
      requestAnimationFrame(clearCanvas)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Once the saved list resolves, pick the sensible starting tab.
  React.useEffect(() => {
    if (open && saved !== undefined) {
      setMode(saved.length > 0 ? "saved" : "draw")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, saved !== undefined])

  function ctx() {
    const c = canvasRef.current
    return c ? c.getContext("2d") : null
  }

  function clearCanvas() {
    const c = canvasRef.current
    const g = ctx()
    if (!c || !g) return
    g.clearRect(0, 0, c.width, c.height)
    g.fillStyle = "#ffffff"
    g.fillRect(0, 0, c.width, c.height)
    setHasDrawing(false)
  }

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!
    const rect = c.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (c.width / rect.width),
      y: (e.clientY - rect.top) * (c.height / rect.height),
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (mode !== "draw") return
    drawing.current = true
    const g = ctx()
    if (!g) return
    const { x, y } = pos(e)
    g.beginPath()
    g.moveTo(x, y)
    g.lineWidth = 2.5
    g.lineCap = "round"
    g.strokeStyle = "#111827"
    canvasRef.current?.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || mode !== "draw") return
    const g = ctx()
    if (!g) return
    const { x, y } = pos(e)
    g.lineTo(x, y)
    g.stroke()
    setHasDrawing(true)
  }
  function onPointerUp() {
    drawing.current = false
  }

  function renderTyped(value: string) {
    setTyped(value)
    const c = canvasRef.current
    const g = ctx()
    if (!c || !g) return
    clearCanvas()
    g.fillStyle = "#111827"
    g.font = "48px 'Segoe Script', 'Brush Script MT', cursive"
    g.textBaseline = "middle"
    g.fillText(value, 20, c.height / 2)
    setHasDrawing(value.trim().length > 0)
  }

  // Confirm with a saved signature — reuse its storageId directly, no upload.
  async function confirmSaved() {
    if (!selectedSaved) {
      toast.error("Pick a signature first.")
      return
    }
    const sig = saved?.find((s) => s._id === selectedSaved)
    if (!sig) return
    setBusy(true)
    try {
      await onSigned(sig.storageId)
      onOpenChange(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't apply signature"))
    } finally {
      setBusy(false)
    }
  }

  // Confirm with a freshly drawn/typed signature — upload it, optionally save.
  async function confirmDrawn() {
    const c = canvasRef.current
    if (!c || !hasDrawing) {
      toast.error("Add a signature first.")
      return
    }
    setBusy(true)
    try {
      const blob: Blob | null = await new Promise((resolve) =>
        c.toBlob((b) => resolve(b), "image/png"),
      )
      if (!blob) throw new Error("Couldn't capture the signature.")
      const url = await getUploadUrl()
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "image/png" },
        body: blob,
      })
      if (!res.ok) throw new Error("Upload failed.")
      const { storageId } = (await res.json()) as { storageId: string }
      if (saveIt) {
        try {
          await saveSignature({
            storageId: storageId as Id<"_storage">,
            label: saveLabel.trim() || (mode === "type" ? typed : "My signature"),
          })
        } catch {
          // Saving for reuse is best-effort; don't block the signing itself.
          toast.error("Couldn't save for reuse, but your signature was applied.")
        }
      }
      await onSigned(storageId)
      onOpenChange(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save signature"))
    } finally {
      setBusy(false)
    }
  }

  async function handleRemoveSaved(id: Id<"savedSignatures">) {
    try {
      await removeSignature({ id })
      if (selectedSaved === id) setSelectedSaved(null)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't remove signature"))
    }
  }

  const canConfirm =
    mode === "saved" ? selectedSaved !== null : hasDrawing

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            {hasSaved && (
              <Button
                variant={mode === "saved" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("saved")}
              >
                Saved
              </Button>
            )}
            <Button
              variant={mode === "draw" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setMode("draw")
                clearCanvas()
              }}
            >
              Draw
            </Button>
            <Button
              variant={mode === "type" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setMode("type")
                renderTyped(typed)
              }}
            >
              Type
            </Button>
          </div>

          {mode === "saved" ? (
            <div className="grid grid-cols-2 gap-2">
              {(saved ?? []).map((s) => (
                <div
                  key={s._id}
                  className={cn(
                    "group relative cursor-pointer rounded-md border bg-white p-1 transition",
                    selectedSaved === s._id
                      ? "border-primary ring-primary/40 ring-2"
                      : "hover:border-muted-foreground/40",
                  )}
                  onClick={() => setSelectedSaved(s._id)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.url ?? ""}
                    alt={s.label}
                    className="h-16 w-full object-contain"
                  />
                  <div className="truncate px-1 pt-0.5 text-center text-[11px] text-muted-foreground">
                    {s.label}
                  </div>
                  <button
                    type="button"
                    aria-label="Remove signature"
                    className="bg-background/80 absolute top-1 right-1 rounded p-0.5 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleRemoveSaved(s._id)
                    }}
                  >
                    <IconTrash className="size-3.5" />
                  </button>
                </div>
              ))}
              {(saved ?? []).length === 0 && (
                <p className="text-muted-foreground col-span-2 py-6 text-center text-sm">
                  No saved signatures yet.
                </p>
              )}
            </div>
          ) : (
            <>
              {mode === "type" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sig-name">Full name</Label>
                  <Input
                    id="sig-name"
                    value={typed}
                    onChange={(e) => renderTyped(e.target.value)}
                    placeholder="Jane Tan"
                  />
                </div>
              )}

              <canvas
                ref={canvasRef}
                width={440}
                height={150}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
                className={cn(
                  "w-full touch-none rounded-md border bg-white",
                  mode === "draw" ? "cursor-crosshair" : "cursor-default",
                )}
              />
              <div className="flex justify-between">
                <Button variant="ghost" size="sm" onClick={clearCanvas}>
                  Clear
                </Button>
                <span className="text-muted-foreground text-xs">
                  {mode === "draw"
                    ? "Draw your signature above."
                    : "Your typed name is rendered as a signature."}
                </span>
              </div>

              <div className="flex flex-col gap-2 rounded-md border p-2.5">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={saveIt}
                    onCheckedChange={(v) => setSaveIt(v === true)}
                  />
                  Save this signature for reuse
                </label>
                {saveIt && (
                  <Input
                    value={saveLabel}
                    onChange={(e) => setSaveLabel(e.target.value)}
                    placeholder="Label (e.g. Formal)"
                    maxLength={60}
                  />
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            onClick={mode === "saved" ? confirmSaved : confirmDrawn}
            disabled={busy || !canConfirm}
          >
            {busy ? "Saving…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
