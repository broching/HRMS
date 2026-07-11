"use client"

import { createRoot } from "react-dom/client"
import { toPng } from "html-to-image"
import { jsPDF } from "jspdf"
import { PDFDocument } from "pdf-lib"
import {
  PaymentRequestDocument,
  type PaymentRequestPrint,
} from "@/features/payment-requests/components/payment-request-document"
import { createZip, type ZipEntry } from "@/lib/zip"
import { requestRef } from "@/features/payment-requests/lib/labels"

const RENDER_WIDTH = 760

function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim()
}

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
        /* best effort */
      }
    }),
  )
}

// Render the request document into an isolated light-themed iframe and rasterize
// to a PNG data URL. Mirrors the payslip PDF pipeline (handles Tailwind oklch).
async function renderRequestPng(
  req: PaymentRequestPrint,
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

  const linkLoads: Promise<void>[] = []
  for (const el of Array.from(
    document.querySelectorAll('style, link[rel="stylesheet"]'),
  )) {
    const clone = el.cloneNode(true)
    doc.head.appendChild(clone)
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
  mount.style.padding = "24px"
  mount.style.background = "#ffffff"
  doc.body.appendChild(mount)

  const root = createRoot(mount)
  try {
    await new Promise<void>((resolve) => {
      root.render(<PaymentRequestDocument req={req} />)
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

// Fit a rasterized request onto A4 pages, paginating if taller than one page.
function requestPdf(dataUrl: string, width: number, height: number): jsPDF {
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
  return pdf
}

async function baseRequestPdfBytes(req: PaymentRequestPrint): Promise<ArrayBuffer> {
  const { dataUrl, width, height } = await renderRequestPng(req)
  return requestPdf(dataUrl, width, height).output("arraybuffer")
}

// A4 in points, for laying out image attachments.
const A4 = { w: 595.28, h: 841.89 }

// Append an image attachment as its own centered page.
async function appendImagePage(
  out: PDFDocument,
  bytes: ArrayBuffer,
  contentType: string | null,
) {
  const isJpg = contentType?.includes("jpeg") || contentType?.includes("jpg")
  const img = isJpg ? await out.embedJpg(bytes) : await out.embedPng(bytes)
  const page = out.addPage([A4.w, A4.h])
  const margin = 24
  const maxW = A4.w - margin * 2
  const maxH = A4.h - margin * 2
  const scale = Math.min(maxW / img.width, maxH / img.height, 1)
  const w = img.width * scale
  const h = img.height * scale
  page.drawImage(img, { x: (A4.w - w) / 2, y: (A4.h - h) / 2, width: w, height: h })
}

// Build one request PDF, optionally merging its supporting documents as trailing
// pages (images become new pages; PDF attachments are copied page-by-page).
export async function buildRequestPdf(
  req: PaymentRequestPrint,
  withAttachments: boolean,
): Promise<Blob> {
  const baseBytes = await baseRequestPdfBytes(req)
  if (!withAttachments || req.attachments.length === 0) {
    return new Blob([baseBytes], { type: "application/pdf" })
  }

  const out = await PDFDocument.load(baseBytes)
  for (const att of req.attachments) {
    try {
      const res = await fetch(att.url)
      if (!res.ok) continue
      const bytes = await res.arrayBuffer()
      const type = att.contentType ?? ""
      if (type === "application/pdf") {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
        const pages = await out.copyPages(src, src.getPageIndices())
        for (const p of pages) out.addPage(p)
      } else if (type.startsWith("image/")) {
        await appendImagePage(out, bytes, type)
      }
      // Other types can't be merged into a PDF — silently skipped.
    } catch {
      /* skip an attachment that won't merge */
    }
  }
  const merged = await out.save()
  return new Blob([merged], { type: "application/pdf" })
}

export async function buildRequestsPdfZip(
  reqs: PaymentRequestPrint[],
  withAttachments: boolean,
  fileMonth: string,
): Promise<Blob> {
  const entries: ZipEntry[] = []
  for (const req of reqs) {
    const pdf = await buildRequestPdf(req, withAttachments)
    entries.push({
      name: `${requestRef(req.requestNumber)} — ${safeName(req.employeeName)} — ${fileMonth}.pdf`,
      data: await pdf.arrayBuffer(),
    })
  }
  return createZip(entries)
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
