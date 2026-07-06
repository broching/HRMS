// Shared product-line taxonomy for the LeadMighty landing page. LM·HR is live;
// the rest are the roadmap that proves the "growing suite" thesis. `hue`/`hue2`
// map to the CSS spectrum tokens so each product owns a band of the spectrum.

export type ProductStatus = "live" | "building" | "roadmap";

export type Product = {
  code: string; // "LM·HR" — real taxonomy, used as the structural label
  name: string;
  kicker: string; // one-line "what it is"
  blurb: string; // longer explainer
  status: ProductStatus;
  hue: string;
  hue2: string;
  angle: number; // beam angle in the hero prism (deg from incoming ray)
  capabilities: string[];
};

export const PRODUCTS: Product[] = [
  {
    code: "LM·HR",
    name: "LeadMightyHR",
    kicker: "Run your whole team from one place",
    blurb:
      "People, leave, claims, payroll, attendance, performance and hiring — the full HR stack, built Singapore-first with CPF-ready payroll.",
    status: "live",
    hue: "#4f7bff",
    hue2: "#8b7bff",
    angle: -21,
    capabilities: [
      "Employee records & org chart",
      "Leave policies & approvals",
      "Multi-currency expense claims",
      "SG CPF payroll & payslips",
      "QR + GPS attendance",
      "Appraisals & 360 feedback",
    ],
  },
  {
    code: "LM·CRM",
    name: "LeadMightySales",
    kicker: "Turn pipeline into revenue",
    blurb:
      "A deal engine that shares the same customer spine as the rest of your suite — no more re-keying contacts between tools.",
    status: "building",
    hue: "#9a6bff",
    hue2: "#c46bff",
    angle: -7,
    capabilities: [
      "Visual deal pipeline",
      "Contact & account timeline",
      "Quotes & forecasting",
    ],
  },
  {
    code: "LM·FIN",
    name: "LeadMightyFinance",
    kicker: "Close the books faster",
    blurb:
      "Invoicing, expenses and reconciliation that read straight from payroll and sales — one ledger, no exports.",
    status: "roadmap",
    hue: "#38d6c8",
    hue2: "#35b0ff",
    angle: 7,
    capabilities: [
      "Invoicing & billing",
      "Expense reconciliation",
      "Real-time cash view",
    ],
  },
  {
    code: "LM·DESK",
    name: "LeadMightyDesk",
    kicker: "Support that scales with you",
    blurb:
      "A shared inbox and helpdesk wired to the same accounts your sales and finance teams already use.",
    status: "roadmap",
    hue: "#ffb020",
    hue2: "#ff7a59",
    angle: 21,
    capabilities: [
      "Shared team inbox",
      "SLA & routing rules",
      "Knowledge base",
    ],
  },
];

export const STATUS_LABEL: Record<ProductStatus, string> = {
  live: "Available now",
  building: "In development",
  roadmap: "On the roadmap",
};
