"use client"

import * as React from "react"
import { toast } from "sonner"
import {
  IconZoomIn,
  IconZoomOut,
  IconZoomReset,
  IconRotateClockwise,
  IconDownload,
  IconExternalLink,
  IconArrowsMaximize,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const MIN_SCALE = 0.25
const MAX_SCALE = 8
const STEP = 0.25

type Props = {
  url: string
  title?: string
  /** Filename used for the download action. */
  fileName?: string
  /** Force a renderer; otherwise inferred from the url / fileName. */
  kind?: "image" | "pdf"
  open: boolean
  onOpenChange: (open: boolean) => void
}

function looksLikePdf(url: string, fileName?: string): boolean {
  const s = `${fileName ?? ""} ${url}`.toLowerCase()
  return s.includes(".pdf")
}

/**
 * Shared viewer for any uploaded document (receipts, attachments, forms). Images
 * get zoom (buttons + wheel), rotate, and drag-to-pan; PDFs render in an inline
 * frame with the browser's native controls. Both offer download + open-in-new-
 * tab. Keyboard: +/- zoom, 0 reset, R rotate, F fit, Esc close.
 */
export function DocumentViewer({
  url,
  title = "Document",
  fileName,
  kind,
  open,
  onOpenChange,
}: Props) {
  const isPdf = kind === "pdf" || (kind !== "image" && looksLikePdf(url, fileName))

  const [scale, setScale] = React.useState(1)
  const [rotation, setRotation] = React.useState(0)
  const [pan, setPan] = React.useState({ x: 0, y: 0 })
  const dragRef = React.useRef<{ x: number; y: number; px: number; py: number } | null>(
    null,
  )

  const reset = React.useCallback(() => {
    setScale(1)
    setRotation(0)
    setPan({ x: 0, y: 0 })
  }, [])

  // Reset the view each time a viewer opens.
  React.useEffect(() => {
    if (open) reset()
  }, [open, url, reset])

  const zoomIn = React.useCallback(
    () => setScale((s) => Math.min(MAX_SCALE, +(s + STEP).toFixed(2))),
    [],
  )
  const zoomOut = React.useCallback(
    () => setScale((s) => Math.max(MIN_SCALE, +(s - STEP).toFixed(2))),
    [],
  )
  const rotate = React.useCallback(() => setRotation((r) => (r + 90) % 360), [])

  // Keyboard shortcuts while open (image only — PDFs use native controls).
  React.useEffect(() => {
    if (!open || isPdf) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "+" || e.key === "=") zoomIn()
      else if (e.key === "-") zoomOut()
      else if (e.key === "0") reset()
      else if (e.key.toLowerCase() === "r") rotate()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, isPdf, zoomIn, zoomOut, rotate, reset])

  async function download() {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const href = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = href
      a.download = fileName || title || "document"
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(href)
    } catch {
      // Fall back to opening in a new tab if the blob fetch is blocked.
      window.open(url, "_blank", "noopener")
      toast.error("Download blocked — opened in a new tab instead.")
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (isPdf) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current
    if (!d) return
    setPan({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) })
  }
  function onPointerUp() {
    dragRef.current = null
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] w-[95vw] max-w-[95vw] flex-col gap-2 p-3">
        <DialogHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pr-8">
          <DialogTitle className="text-sm">{title}</DialogTitle>
          <div className="flex items-center gap-1">
            {!isPdf && (
              <>
                <IconBtn onClick={zoomOut} title="Zoom out (−)">
                  <IconZoomOut className="size-4" />
                </IconBtn>
                <span className="text-muted-foreground w-12 text-center text-xs tabular-nums">
                  {Math.round(scale * 100)}%
                </span>
                <IconBtn onClick={zoomIn} title="Zoom in (+)">
                  <IconZoomIn className="size-4" />
                </IconBtn>
                <IconBtn onClick={reset} title="Reset (0)">
                  <IconZoomReset className="size-4" />
                </IconBtn>
                <IconBtn onClick={rotate} title="Rotate (R)">
                  <IconRotateClockwise className="size-4" />
                </IconBtn>
                <span className="bg-border mx-1 h-5 w-px" aria-hidden />
              </>
            )}
            <IconBtn onClick={download} title="Download">
              <IconDownload className="size-4" />
            </IconBtn>
            <a href={url} target="_blank" rel="noreferrer" title="Open in new tab">
              <IconBtn>
                <IconExternalLink className="size-4" />
              </IconBtn>
            </a>
          </div>
        </DialogHeader>

        {isPdf ? (
          <iframe
            src={url}
            title={title}
            className="min-h-0 flex-1 rounded-md border"
          />
        ) : (
          <div
            className={cn(
              "bg-muted/30 relative min-h-0 flex-1 overflow-hidden rounded-md border",
              "cursor-grab touch-none select-none active:cursor-grabbing",
            )}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onWheel={(e) => {
              if (e.deltaY < 0) zoomIn()
              else zoomOut()
            }}
            onDoubleClick={() => (scale > 1 ? reset() : zoomIn())}
          >
            <div className="flex size-full items-center justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={title}
                draggable={false}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale}) rotate(${rotation}deg)`,
                }}
                className="max-h-full max-w-full object-contain transition-transform"
              />
            </div>
            <div className="text-muted-foreground pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-background/80 px-2.5 py-1 text-[11px] shadow-sm">
              Scroll to zoom · drag to pan · double-click to reset
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function IconBtn({
  onClick,
  title,
  children,
}: {
  onClick?: () => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="size-8"
      onClick={onClick}
      title={title}
    >
      {children}
    </Button>
  )
}
