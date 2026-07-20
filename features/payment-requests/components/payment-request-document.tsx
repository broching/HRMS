import type { FunctionReturnType } from "convex/server"
import type { api } from "@/convex/_generated/api"
import type { PaymentRequestShow, PaymentRequestItem } from "@/convex/lib/enums"
import { formatMoney, requestRef } from "@/features/payment-requests/lib/labels"
import { countryName } from "@/lib/countries"
import { GRID_COLS, ROW_PX } from "@/features/payroll/lib/payslip-layout"
import {
  prNormalizeLayout,
  prMakeDefaultLayout,
  type PrLayoutBlock,
} from "@/features/payment-requests/lib/pr-layout"

export type PaymentRequestPrint = FunctionReturnType<
  typeof api.paymentRequests.getForPrint
>[number]

// Style knobs a template can set (mirrors payslip templates). All optional; the
// resolver below fills sensible defaults so old templates keep rendering.
export type PaymentRequestStyle = {
  accentColor: string | null
  fontFamily: string | null
  textColor: string | null
  fontScale: number | null
  density: "compact" | "normal" | "relaxed" | null
  show: PaymentRequestShow | null
  // Drag/resize block layout (12-col grid). Absent/null = classic stacked flow.
  layout?: PrLayoutBlock[] | null
}

const DEFAULT_SHOW: PaymentRequestShow = {
  logo: true,
  heading: true,
  attachNote: true,
  signatures: true,
  requestorSignature: true,
  footer: true,
}

// Vertical gaps (px) between the field rows and between signature blocks, per
// density.
const DENSITY_GAP: Record<
  "compact" | "normal" | "relaxed",
  { fields: number; sig: number }
> = {
  compact: { fields: 4, sig: 16 },
  normal: { fields: 6, sig: 22 },
  relaxed: { fields: 9, sig: 30 },
}

export function resolveStyle(style?: PaymentRequestStyle | null) {
  const density = style?.density ?? "normal"
  return {
    accentColor: style?.accentColor || "#111827",
    fontFamily: style?.fontFamily || "Arial, Helvetica, sans-serif",
    textColor: style?.textColor || "#111827",
    fontScale: style?.fontScale || 1,
    density,
    gap: DENSITY_GAP[density],
    show: { ...DEFAULT_SHOW, ...(style?.show ?? {}) },
    layout: style?.layout ?? null,
  }
}

// Resolve the block list to render: an explicit saved layout (normalized), or a
// default stacked layout whose visibility is derived from the `show` toggles so
// pre-layout templates render exactly as before.
function effectivePrLayout(
  layout: PrLayoutBlock[] | null,
  show: PaymentRequestShow,
): PrLayoutBlock[] {
  if (layout && layout.length > 0) return prNormalizeLayout(layout)
  return prMakeDefaultLayout().map((b) => {
    let visible = b.visible
    if (b.type === "logo") visible = show.logo
    if (b.type === "heading") visible = show.heading
    if (b.type === "attachNote") visible = show.attachNote
    if (b.type === "signatures") visible = show.signatures
    if (b.type === "footer") visible = show.footer
    return { ...b, visible }
  })
}

// The printable "Request for Payment" business document, arranged on a 12-column
// grid from the template's block layout (position + width carry through to the
// rasterized PDF). Styled by the template (fonts, colours, density) and
// `styleOverride` lets the settings preview drive styling without a saved
// template.
export function PaymentRequestDocument({
  req,
  styleOverride,
}: {
  req: PaymentRequestPrint
  styleOverride?: PaymentRequestStyle
}) {
  const s = resolveStyle(styleOverride ?? req.style)
  const base = 14 * s.fontScale

  const sigBlocks: {
    role: string
    name: string
    url: string | null
    date?: number
  }[] = [
    // The requestor's "Requested by" block is optional — some orgs don't need it.
    ...(s.show.requestorSignature
      ? [
          {
            role: "Requested by",
            name: req.employeeName,
            url: req.requestorSignatureUrl,
          },
        ]
      : []),
    ...req.signatures.map((sig) => ({
      role: labelFor(sig.role),
      name: sig.name,
      url: sig.url,
      date: sig.signedAt,
    })),
  ]

  function renderPrBlock(block: PrLayoutBlock): React.ReactNode {
    switch (block.type) {
      case "logo":
        if (!req.logoUrl) return null
        return (
          <div style={{ textAlign: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={req.logoUrl}
              alt={req.orgName}
              style={{
                maxHeight: 56,
                maxWidth: 220,
                objectFit: "contain",
                margin: "0 auto",
              }}
            />
          </div>
        )
      case "heading":
        return (
          <div
            style={{
              textAlign: "center",
              fontSize: 22 * s.fontScale,
              fontWeight: 700,
              textDecoration: "underline",
              letterSpacing: 0.5,
              color: s.accentColor,
            }}
          >
            {req.headerText}
          </div>
        )
      case "details":
        return (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: s.gap.fields,
            }}
          >
            <Field label="Date" value={req.requestDate} />
            <Field label="Requestor's Name" value={req.employeeName} />
            <Field label="Purpose of Request" value={req.purpose} />
            {req.items && req.items.length > 0 ? (
              <ItemsTable
                items={req.items}
                currency={req.currency}
                totalCents={req.amountCents}
                accentColor={s.accentColor}
              />
            ) : (
              <Field
                label="Amount Requested"
                value={formatMoney(req.amountCents, req.currency)}
              />
            )}
            <Field label="Account / Payee Name" value={req.payeeName} />
            {req.country && (
              <Field label="Country" value={countryName(req.country)} />
            )}
            {req.templateFields.map((f) => {
              const val = req.fieldValues[f.key]
              if (!val) return null
              return <Field key={f.key} label={f.label} value={val} />
            })}
            {req.remarks && <Field label="Remarks" value={req.remarks} />}
          </div>
        )
      case "attachNote":
        return (
          <div style={{ fontStyle: "italic" }}>
            Pls attach supporting document with the form.
          </div>
        )
      case "signatures":
        if (sigBlocks.length === 0) return null
        return (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: s.gap.sig,
            }}
          >
            {sigBlocks.map((b, i) => (
              <div key={i}>
                <div style={{ fontWeight: 600 }}>{b.role}:</div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 8,
                    marginTop: 2,
                  }}
                >
                  <span>Signature:</span>
                  <span
                    style={{
                      position: "relative",
                      display: "inline-block",
                      minWidth: 220,
                      height: 44,
                    }}
                  >
                    {b.url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={b.url}
                        alt="signature"
                        style={{
                          position: "absolute",
                          bottom: 4,
                          left: 16,
                          maxHeight: 38,
                          maxWidth: 180,
                          objectFit: "contain",
                        }}
                      />
                    )}
                    <span
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: 0,
                        borderBottom: "1px solid #111827",
                      }}
                    />
                  </span>
                </div>
                <div>Name: {b.name}</div>
                <div>
                  Date:{" "}
                  {b.date
                    ? new Date(b.date).toISOString().slice(0, 10)
                    : req.requestDate}
                </div>
              </div>
            ))}
          </div>
        )
      case "footer":
        return (
          <div style={{ fontSize: 11, color: "#6b7280" }}>
            {requestRef(req.requestNumber)} · {req.orgName}
          </div>
        )
      case "customText":
        if (!block.text) return null
        return (
          <div
            style={{
              whiteSpace: "pre-line",
              textAlign: block.align ?? "left",
              fontWeight: block.heading ? 700 : 400,
              fontSize: block.heading ? 18 * s.fontScale : base,
              color: block.heading ? s.accentColor : undefined,
            }}
          >
            {block.text}
          </div>
        )
      case "divider":
        return <div style={{ borderTop: "1px solid #e5e7eb" }} />
      case "spacer":
        return <div aria-hidden />
      default:
        return null
    }
  }

  const blocks = effectivePrLayout(s.layout, s.show)
    .filter((b) => b.visible)
    .sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0))

  return (
    <div
      style={{
        fontFamily: s.fontFamily,
        color: s.textColor,
        background: "#ffffff",
        padding: "8px 12px",
        fontSize: base,
        lineHeight: 1.55,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
          gridAutoFlow: "row dense",
          alignItems: "start",
          gap: s.gap.sig,
        }}
      >
        {blocks.map((block) => {
          const node = renderPrBlock(block)
          if (node === null) return null
          const w = Math.min(GRID_COLS, Math.max(1, block.w ?? GRID_COLS))
          const x = Math.min(GRID_COLS - w, Math.max(0, block.x ?? 0))
          const isSpacer = block.type === "spacer"
          return (
            <div
              key={block.id}
              style={{
                gridColumn: `${x + 1} / span ${w}`,
                height: isSpacer ? (block.h ?? 3) * ROW_PX : undefined,
                minHeight:
                  !isSpacer && block.h ? block.h * ROW_PX : undefined,
              }}
            >
              {node}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Map an approver step label ("Manager — Jane", "Finance") to the printed role
// line. Keeps the more descriptive step label but drops any resolved name suffix.
function labelFor(role: string): string {
  if (role === "Finance") return "Verified by"
  return "Approved by"
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span style={{ fontWeight: 400 }}>{label}: </span>
      <span>{value}</span>
    </div>
  )
}

// Itemised breakdown for the printed form: a bordered table headed by the accent
// colour, one row per item (#, description, qty, unit price, amount), closed by a
// bold Total row. Inline-styled so it rasterizes cleanly to the PDF.
function ItemsTable({
  items,
  currency,
  totalCents,
  accentColor,
}: {
  items: PaymentRequestItem[]
  currency: string
  totalCents: number
  accentColor: string
}) {
  const cellBase: React.CSSProperties = {
    padding: "5px 8px",
    borderBottom: "1px solid #e5e7eb",
    verticalAlign: "top",
  }
  const th: React.CSSProperties = {
    padding: "6px 8px",
    textAlign: "left",
    fontWeight: 600,
    color: "#ffffff",
    background: accentColor,
  }
  const num: React.CSSProperties = { textAlign: "right", whiteSpace: "nowrap" }
  return (
    <div>
      <div style={{ marginBottom: 4, fontWeight: 400 }}>Items:</div>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          border: "1px solid #e5e7eb",
          fontSize: "inherit",
        }}
      >
        <thead>
          <tr>
            <th style={{ ...th, width: 26, textAlign: "right" }}>#</th>
            <th style={th}>Description</th>
            <th style={{ ...th, textAlign: "right", width: 44 }}>Qty</th>
            <th style={{ ...th, textAlign: "right", width: 90 }}>Unit price</th>
            <th style={{ ...th, textAlign: "right", width: 100 }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td style={{ ...cellBase, ...num, color: "#6b7280" }}>{i + 1}</td>
              <td style={cellBase}>{it.description}</td>
              <td style={{ ...cellBase, ...num }}>{it.quantity}</td>
              <td style={{ ...cellBase, ...num }}>
                {formatMoney(it.unitPriceCents, currency)}
              </td>
              <td style={{ ...cellBase, ...num }}>
                {formatMoney(it.amountCents, currency)}
              </td>
            </tr>
          ))}
          <tr>
            <td
              colSpan={4}
              style={{
                padding: "6px 8px",
                textAlign: "right",
                fontWeight: 700,
                borderTop: "2px solid #111827",
              }}
            >
              Total
            </td>
            <td
              style={{
                padding: "6px 8px",
                textAlign: "right",
                fontWeight: 700,
                whiteSpace: "nowrap",
                borderTop: "2px solid #111827",
              }}
            >
              {formatMoney(totalCents, currency)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
