import type { Metadata } from "next";
import { DocPage, type DocSection } from "../../_components/doc-page";

export const metadata: Metadata = {
  title: "Privacy Policy — LeadMighty",
  description:
    "How LeadMighty collects, uses, protects and shares personal data across its products.",
};

const UPDATED = "18 July 2026";

const SECTIONS: DocSection[] = [
  {
    id: "scope",
    title: "Who this covers",
    blocks: [
      {
        type: "p",
        text: "This policy explains how LeadMighty handles personal data. It applies to visitors to our website, people who contact us, and users of our products such as LeadMightyHR.",
      },
      {
        type: "p",
        text: "For most product data, your employer is the controller and LeadMighty is the processor — we handle the data on their instructions. If you're an employee using the product, please also read your employer's own privacy notice.",
      },
    ],
  },
  {
    id: "what-we-collect",
    title: "What we collect",
    blocks: [
      { type: "h", text: "You give us" },
      {
        type: "list",
        items: [
          "Account details: name, work email, organisation and role.",
          "Product content your organisation enters: employee records, leave, claims, payroll figures, attendance and documents.",
          "Messages you send us, such as support requests and enquiries.",
        ],
      },
      { type: "h", text: "We collect automatically" },
      {
        type: "list",
        items: [
          "Usage and device data needed to run and secure the service (e.g. log data, IP address, browser).",
          "Cookies and similar technologies for sign-in, preferences and analytics.",
        ],
      },
    ],
  },
  {
    id: "how-we-use",
    title: "How we use it",
    blocks: [
      { type: "p", text: "We use personal data to:" },
      {
        type: "list",
        items: [
          "Provide, maintain and secure the products.",
          "Process billing and manage subscriptions.",
          "Respond to support and communicate about the service.",
          "Improve reliability and build new features.",
          "Meet legal and regulatory obligations.",
        ],
      },
      {
        type: "p",
        text: "We do not sell personal data, and we do not use your product content to train third-party AI models.",
      },
    ],
  },
  {
    id: "legal-basis",
    title: "Legal basis",
    blocks: [
      {
        type: "p",
        text: "Depending on where you are, we rely on your consent, the performance of a contract, our legitimate interests in running the business, or compliance with law. Where the Singapore PDPA applies, we handle personal data in line with its consent, purpose-limitation and protection obligations.",
      },
    ],
  },
  {
    id: "sharing",
    title: "Who we share it with",
    blocks: [
      {
        type: "p",
        text: "We share personal data only as needed to run the service, and under appropriate safeguards:",
      },
      {
        type: "list",
        items: [
          "Sub-processors that host and support the product (for example, cloud hosting, email delivery and payment processing).",
          "Authorities where the law requires it.",
          "A successor entity in the event of a merger or acquisition, subject to this policy.",
        ],
      },
      {
        type: "p",
        text: "A current list of sub-processors is available on request at privacy@leadmighty.com.",
      },
    ],
  },
  {
    id: "retention",
    title: "Retention and deletion",
    blocks: [
      {
        type: "p",
        text: "We keep personal data for as long as your organisation's account is active and as needed to provide the service. After termination we delete or return product content on request, following a short grace period, unless the law requires us to keep it longer.",
      },
    ],
  },
  {
    id: "security",
    title: "How we protect it",
    blocks: [
      {
        type: "p",
        text: "We apply technical and organisational measures including encryption in transit, tenant isolation, role-based access controls and least-privilege access for our team. See our Security page for more detail.",
      },
    ],
  },
  {
    id: "your-rights",
    title: "Your rights",
    blocks: [
      {
        type: "p",
        text: "Subject to local law, you may request access to, correction of, or deletion of your personal data, and object to or restrict certain processing. For product content held on your employer's behalf, we'll direct your request to them.",
      },
      {
        type: "p",
        text: "To exercise a right, email privacy@leadmighty.com. You may also complain to your local data protection authority.",
      },
    ],
  },
  {
    id: "contact",
    title: "Contact",
    blocks: [
      {
        type: "p",
        text: "For any privacy question, contact our team at privacy@leadmighty.com. We'll update this policy as our products and obligations evolve and will note the date of the latest change above.",
      },
    ],
  },
];

export default function PrivacyPage() {
  return (
    <DocPage
      eyebrow="Legal / Privacy Policy"
      title="Privacy Policy"
      intro="What we collect, why we collect it, and the controls you have. We treat your people's data the way you'd want your own handled."
      updated={UPDATED}
      sections={SECTIONS}
    />
  );
}
