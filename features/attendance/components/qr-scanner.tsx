"use client"

import * as React from "react"
import jsQR from "jsqr"
import { IconCameraOff } from "@tabler/icons-react"

/**
 * Live camera QR scanner. Streams the rear camera into a hidden canvas and
 * decodes frames with jsQR; calls `onResult` once with the decoded text, then
 * stops. Pure browser APIs (getUserMedia + canvas) so it works as a PWA with
 * no native dependency.
 */
export function QrScanner({
  onResult,
  onError,
}: {
  onResult: (text: string) => void
  onError?: (message: string) => void
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const canvasRef = React.useRef<HTMLCanvasElement>(null)
  const [status, setStatus] = React.useState<"starting" | "scanning" | "error">(
    "starting",
  )
  // Keep the latest callbacks without re-running the camera effect.
  const onResultRef = React.useRef(onResult)
  const onErrorRef = React.useRef(onError)
  onResultRef.current = onResult
  onErrorRef.current = onError

  React.useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let done = false

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        })
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        setStatus("scanning")
        tick()
      } catch {
        setStatus("error")
        onErrorRef.current?.(
          "Couldn't access the camera. Check browser permissions.",
        )
      }
    }

    function tick() {
      if (done) return
      const video = videoRef.current
      const canvas = canvasRef.current
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        const w = video.videoWidth
        const h = video.videoHeight
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext("2d", { willReadFrequently: true })
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h)
          const image = ctx.getImageData(0, 0, w, h)
          const code = jsQR(image.data, w, h, {
            inversionAttempts: "dontInvert",
          })
          if (code && code.data) {
            done = true
            onResultRef.current(code.data)
            return
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }

    start()
    return () => {
      done = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <div className="bg-muted relative aspect-square w-full overflow-hidden rounded-lg">
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        playsInline
        muted
      />
      <canvas ref={canvasRef} className="hidden" />
      {/* Reticle */}
      {status === "scanning" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="border-primary/80 size-2/3 rounded-lg border-2" />
        </div>
      )}
      {status === "starting" && (
        <div className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm">
          Starting camera…
        </div>
      )}
      {status === "error" && (
        <div className="text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm">
          <IconCameraOff className="size-6" />
          Camera unavailable
        </div>
      )}
    </div>
  )
}
