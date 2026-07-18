import type { Metadata } from "next";
import { DocPage, type DocSection } from "../../_components/doc-page";

export const metadata: Metadata = {
  title: "Security — LeadMighty",
  description:
    "How LeadMighty protects your organisation's data: isolation, encryption, access control and operational practices.",
};

const UPDATED = "18 July 2026";

const SECTIONS: DocSection[] = [
  {
    id: "approach",
    title: "Our approach",
    blocks: [
      {
        type: "p",
        text: "You're trusting LeadMighty with some of your most sensitive records — salaries, identity documents, health-related leave. We design the product so that data stays private, access is earned, and every action is accountable.",
      },
    ],
  },
  {
    id: "isolation",
    title: "Tenant isolation",
    blocks: [
      {
        type: "p",
        text: "Every organisation's data is scoped to its own workspace and separated from every other tenant. Enterprise customers can go further with a dedicated, single-tenant deployment on their own database and domain.",
      },
    ],
  },
  {
    id: "access",
    title: "Access control",
    blocks: [
      {
        type: "p",
        text: "Inside a workspace, role-based permissions decide exactly what each person can see and do. Sensitive fields — compensation and payslips — are gated to the people who should see them, enforced on the server, not just hidden in the interface.",
      },
      {
        type: "list",
        items: [
          "Granular roles and permissions, configurable per organisation.",
          "Server-side enforcement on every request, so the rules can't be bypassed from the client.",
          "Least-privilege access for LeadMighty staff, granted only when needed for support.",
        ],
      },
    ],
  },
  {
    id: "encryption",
    title: "Encryption",
    blocks: [
      {
        type: "p",
        text: "Data is encrypted in transit using modern TLS, and encrypted at rest by our infrastructure providers. Files you upload are stored in access-controlled object storage.",
      },
    ],
  },
  {
    id: "infrastructure",
    title: "Infrastructure and reliability",
    blocks: [
      {
        type: "p",
        text: "We build on reputable cloud infrastructure with managed backups and redundancy. Our providers maintain recognised security certifications; details are available to customers under NDA.",
      },
    ],
  },
  {
    id: "practices",
    title: "Operational practices",
    blocks: [
      {
        type: "list",
        items: [
          "Changes go through review and automated checks before release.",
          "Secrets and credentials are kept out of source code and rotated when needed.",
          "We monitor for unusual activity and keep audit trails of sensitive actions.",
        ],
      },
    ],
  },
  {
    id: "your-part",
    title: "Your part",
    blocks: [
      {
        type: "p",
        text: "Security is shared. Use strong, unique credentials for your admins, review who has access regularly, and off-board people promptly. The product gives you the controls; you decide how tightly to set them.",
      },
    ],
  },
  {
    id: "report",
    title: "Reporting a vulnerability",
    blocks: [
      {
        type: "p",
        text: "Found something? We want to hear from you. Email security@leadmighty.com with the details and steps to reproduce, and we'll respond quickly. Please give us reasonable time to fix an issue before disclosing it publicly.",
      },
    ],
  },
];

export default function SecurityPage() {
  return (
    <DocPage
      eyebrow="Trust / Security"
      title="Security at LeadMighty"
      intro="How we keep your organisation's data private, isolated and accountable — from tenant isolation to encryption and least-privilege access."
      updated={UPDATED}
      sections={SECTIONS}
    />
  );
}
