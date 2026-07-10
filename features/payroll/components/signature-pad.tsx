"use client"

import * as React from "react"
import { toast } from "sonner"
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
import { cn } from "@/lib/utils"
import { getErrorMessage } from "@/lib/errors"

type Mode = "draw" | "type"

/**
 * Capture a signature (draw on a canvas or type a name), upload it as a PNG via
 * `getUploadUrl`, and hand the resulting storageId to `onSigned`.
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
  const drawing = React.useRef(false)

  // Reset on open.
  React.useEffect(() => {
    if (open) {
      setMode("draw")
      setTyped("")
      setHasDrawing(false)
      // Clear after mount.
      requestAnimationFrame(clearCanvas)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

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

  async function confirm() {
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
      await onSigned(storageId)
      onOpenChange(false)
    } catch (e) {
      toast.error(getErrorMessage(e, "Couldn't save signature"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={busy || !hasDrawing}>
            {busy ? "Saving…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
