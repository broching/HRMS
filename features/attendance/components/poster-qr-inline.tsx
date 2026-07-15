"use client"

import * as React from "react"
import { QRCodeSVG } from "qrcode.react"
import { useMutation } from "convex/react"
import { toast } from "sonner"
import { IconDownload, IconLoader2 } from "@tabler/icons-react"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { getErrorMessage } from "@/lib/errors"

// Rasterise an <svg> QR to a padded PNG and trigger a download.
async function downloadSvgAsPng(svg: SVGSVGElement, filename: string) {
  const size = 1024
  const pad = 96
  const xml = new XMLSerializer().serializeToString(svg)
  const svgUrl =
    "data:image/svg+xml;base64," +
    btoa(unescape(encodeURIComponent(xml)))
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error("render failed"))
    img.src = svgUrl
  })
  const canvas = document.createElement("canvas")
  canvas.width = size + pad * 2
  canvas.height = size + pad * 2
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("canvas unavailable")
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, pad, pad, size, size)
  const png = canvas.toDataURL("image/png")
  const a = document.createElement("a")
  a.href = png
  a.download = filename
  a.click()
}

/**
 * Compact static clock-in QR for the settings page, with a one-click PNG
 * download so an admin can print it without opening the full poster.
 */
export function PosterQrInline({
  officeId,
  officeName,
}: {
  officeId: Id<"offices">
  officeName: string
}) {
  const generate = useMutation(api.attendance.generateStaticQr)
  const [token, setToken] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const wrapRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    let cancelled = false
    generate({ officeId })
      .then((res) => !cancelled && setToken(res.token))
      .catch(
        (e) =>
          !cancelled &&
          setError(getErrorMessage(e, "We couldn't create this office's code.")),
      )
    return () => {
      cancelled = true
    }
  }, [generate, officeId])

  function download() {
    const svg = wrapRef.current?.querySelector("svg")
    if (!svg) return
    downloadSvgAsPng(
      svg as SVGSVGElement,
      `${officeName.replace(/\s+/g, "-").toLowerCase()}-clock-in-qr.png`,
    ).catch(() => toast.error("We couldn't download the image. Please try again."))
  }

  return (
    <div className="flex items-center gap-4">
      <div ref={wrapRef} className="rounded-lg border bg-white p-3">
        {token ? (
          <QRCodeSVG value={token} size={132} level="M" marginSize={1} />
        ) : (
          <div className="flex size-[132px] items-center justify-center">
            {error ? (
              <span className="px-2 text-center text-xs text-red-600">
                {error}
              </span>
            ) : (
              <IconLoader2 className="size-5 animate-spin text-neutral-400" />
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground text-xs">
          Print this and paste it at the entrance. Staff scan it to clock in —
          they must be within the geofence.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          disabled={!token}
          onClick={download}
        >
          <IconDownload className="size-4" />
          Download image
        </Button>
      </div>
    </div>
  )
}
