// Pure builder for the transactional notification email. Produces a single
// self-contained HTML string using inline styles and a table layout so it
// renders consistently across email clients (Gmail, Outlook, Apple Mail).

export type NotificationEmailInput = {
  orgName: string;
  title: string;
  body?: string;
  ctaUrl: string;
  ctaLabel: string;
  accentColor?: string; // hex; defaults to a neutral blue
  fontFamily?: string; // one of FONT_STACKS keys; defaults to "system"
  logoUrl?: string | null;
  footerText?: string | null;
};

const DEFAULT_ACCENT = "#2563eb";

// Email-safe font stacks selectable per module. Keys are stored in settings;
// unknown/absent keys fall back to the system stack.
const FONT_STACKS: Record<string, string> = {
  system:
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  serif: "Georgia,'Times New Roman',Times,serif",
  mono: "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace",
  rounded: "'Trebuchet MS','Segoe UI',Verdana,Geneva,sans-serif",
};

function fontStack(key: string | undefined): string {
  return (key && FONT_STACKS[key]) || FONT_STACKS.system;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Basic hex validation so a bad settings value can't inject styles.
function safeColor(color: string | undefined): string {
  if (color && /^#[0-9a-fA-F]{3,8}$/.test(color)) return color;
  return DEFAULT_ACCENT;
}

export function renderNotificationEmail(input: NotificationEmailInput): string {
  const accent = safeColor(input.accentColor);
  const font = fontStack(input.fontFamily);
  const org = escapeHtml(input.orgName);
  const title = escapeHtml(input.title);
  const body = input.body ? escapeHtml(input.body) : "";
  const cta = escapeHtml(input.ctaLabel);
  const footer = input.footerText ? escapeHtml(input.footerText) : "";

  const header = input.logoUrl
    ? `<img src="${input.logoUrl}" alt="${org}" height="36" style="display:block;max-height:36px;border:0;outline:none;" />`
    : `<span style="font-size:18px;font-weight:700;color:#ffffff;">${org}</span>`;

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:${font};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 0;font-family:${font};">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
            <tr>
              <td style="background-color:${accent};padding:20px 28px;">
                ${header}
              </td>
            </tr>
            <tr>
              <td style="padding:28px 28px 8px 28px;">
                <h1 style="margin:0 0 12px 0;font-size:20px;line-height:1.3;color:#111827;font-family:${font};">${title}</h1>
                ${body ? `<p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#4b5563;font-family:${font};">${body}</p>` : ""}
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:8px;background-color:${accent};">
                      <a href="${input.ctaUrl}" target="_blank" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;font-family:${font};">${cta}</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 28px 28px;">
                <p style="margin:16px 0 0 0;font-size:12px;line-height:1.5;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:16px;">
                  ${footer ? `${footer}<br/>` : ""}You are receiving this because notifications are enabled for ${org}.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
