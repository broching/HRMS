"use client"

import { createRoot } from "react-dom/client"
import { toPng } from "html-to-image"
import { jsPDF } from "jspdf"
import type { FunctionReturnType } from "convex/server"
import type { api } from "@/convex/_generated/api"
import { PayslipDocument } from "@/features/payroll/components/payslip-document"
import { createZip, type ZipEntry } from "@/lib/zip"

type Payslip = FunctionReturnType<typeof api.payroll.getPayslip>

// Render width (px) of the off-document payslip before rasterizing. Matches the
// on-screen payslip width so the exported copy looks like what employees see.
const RENDER_WIDTH = 760

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim()
}

// Wait until every <img> under `node` has finished loading (or errored), so the
// snapshot doesn't capture half-loaded logos/signatures.
async function waitForImages(node: HTMLElement): Promise<void> {
  const imgs = Array.from(node.querySelectorAll("img"))
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) return resolve()
          img.addEventListener("load", () => resolve(), { once: true })
          img.addEventListener("error", () => resolve(), { once: true })
        }),
    ),
  )
}

// Inline remote images (logo, signatures — served from Convex storage) as data
// URLs before capture. html-to-image can taint on cross-origin images; inlining
// first makes the raster reliable. Failures are left as-is (best effort).
async function inlineImages(node: HTMLElement): Promise<void> {
  const imgs = Array.from(node.querySelectorAll("img"))
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute("src")
      if (!src || src.startsWith("data:")) return
      try {
        const res = await fetch(src, { mode: "cors" })
        if (!res.ok) return
        const blob = await res.blob()
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(blob)
        })
        img.setAttribute("src", dataUrl)
      } catch {
        /* best effort — leave the original src */
      }
    }),
  )
}

// Render one payslip into an isolated, light-themed iframe and rasterize it to a
// PNG data URL. The iframe copies the app's stylesheets so the payslip looks
// identical to the in-app document, but without the app's dark-mode class so the
// printed copy is always the light business document.
async function renderPayslipPng(
  slip: Payslip,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const iframe = document.createElement("iframe")
  iframe.style.position = "fixed"
  iframe.style.left = "-10000px"
  iframe.style.top = "0"
  iframe.style.width = `${RENDER_WIDTH + 40}px`
  iframe.style.height = "100px"
  iframe.style.border = "0"
  iframe.setAttribute("aria-hidden", "true")
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument
  if (!doc) {
    iframe.remove()
    throw new Error("Couldn't create the render frame.")
  }

  // Copy stylesheets so Tailwind + theme variables apply inside the frame.
  const linkLoads: Promise<void>[] = []
  for (const el of Array.from(
    document.querySelectorAll('style, link[rel="stylesheet"]'),
  )) {
    const clone = el.cloneNode(true)
    doc.head.appendChild(clone)
    // External stylesheets (prod builds) load async — wait for them so the
    // payslip is fully styled before we rasterize.
    if (clone instanceof HTMLLinkElement) {
      linkLoads.push(
        new Promise<void>((resolve) => {
          if (clone.sheet) return resolve()
          clone.addEventListener("load", () => resolve(), { once: true })
          clone.addEventListener("error", () => resolve(), { once: true })
          setTimeout(resolve, 2000)
        }),
      )
    }
  }
  await Promise.all(linkLoads)
  doc.documentElement.classList.remove("dark")
  doc.documentElement.style.colorScheme = "light"
  doc.body.style.margin = "0"
  doc.body.style.background = "#ffffff"

  const mount = doc.createElement("div")
  mount.style.width = `${RENDER_WIDTH}px`
  mount.style.padding = "20px"
  mount.style.background = "#ffffff"
  doc.body.appendChild(mount)

  const root = createRoot(mount)
  try {
    await new Promise<void>((resolve) => {
      root.render(<PayslipDocument slip={slip} />)
      // Let React commit + the browser lay out before we measure/capture.
      setTimeout(resolve, 60)
    })
    await waitForImages(mount)
    await inlineImages(mount)
    await waitForImages(mount)

    const width = mount.scrollWidth
    const height = mount.scrollHeight
    const dataUrl = await toPng(mount, {
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      width,
      height,
    })
    return { dataUrl, width, height }
  } finally {
    root.unmount()
    iframe.remove()
  }
}

// Fit a rasterized payslip onto A4 pages, paginating if it's taller than one
// page, and return the PDF as a Blob.
function payslipPdfBlob(dataUrl: string, width: number, height: number): Blob {
  const pdf = new jsPDF({ unit: "pt", format: "a4" })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 24
  const imgW = pageW - margin * 2
  const imgH = (height / width) * imgW
  const pageInner = pageH - margin * 2

  let heightLeft = imgH
  let position = margin
  pdf.addImage(dataUrl, "PNG", margin, position, imgW, imgH)
  heightLeft -= pageInner
  while (heightLeft > 0) {
    position = margin - (imgH - heightLeft)
    pdf.addPage()
    pdf.addImage(dataUrl, "PNG", margin, position, imgW, imgH)
    heightLeft -= pageInner
  }
  return pdf.output("blob")
}

// Build a single employee's payslip PDF.
export async function buildPayslipPdf(slip: Payslip): Promise<Blob> {
  const { dataUrl, width, height } = await renderPayslipPng(slip)
  return payslipPdfBlob(dataUrl, width, height)
}

// Build a ZIP of one payslip PDF per employee, named "{Employee} — {month}.pdf".
export async function buildPayslipsPdfZip(
  slips: Payslip[],
  fileMonth: string,
): Promise<Blob> {
  const entries: ZipEntry[] = []
  for (const slip of slips) {
    const pdf = await buildPayslipPdf(slip)
    entries.push({
      name: `${safeName(slip.employeeName)} — ${fileMonth}.pdf`,
      data: await pdf.arrayBuffer(),
    })
  }
  return createZip(entries)
}
