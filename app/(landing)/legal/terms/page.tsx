import type { Metadata } from "next";
import { DocPage, type DocSection } from "../../_components/doc-page";

export const metadata: Metadata = {
  title: "Terms of Service — LeadMighty",
  description:
    "The terms that govern your use of LeadMighty products, including LeadMightyHR.",
};

const UPDATED = "18 July 2026";

const SECTIONS: DocSection[] = [
  {
    id: "agreement",
    title: "The agreement",
    blocks: [
      {
        type: "p",
        text: "These Terms of Service form a binding agreement between LeadMighty (\"LeadMighty\", \"we\", \"us\") and the organisation that subscribes to our products (\"you\"). By creating an account, subscribing, or using any LeadMighty product — including LeadMightyHR — you agree to these terms on behalf of your organisation.",
      },
      {
        type: "p",
        text: "If you are agreeing on behalf of an organisation, you confirm you have the authority to bind it. If you do not agree, do not use the products.",
      },
    ],
  },
  {
    id: "accounts",
    title: "Accounts and access",
    blocks: [
      {
        type: "p",
        text: "You are responsible for the accounts under your workspace, the roles you assign, and keeping sign-in credentials secure. You decide who in your organisation can access which parts of the product.",
      },
      {
        type: "list",
        items: [
          "Keep your admins' credentials confidential and enable available security controls.",
          "You are responsible for activity that happens under your workspace's accounts.",
          "Tell us promptly if you believe an account has been compromised.",
        ],
      },
    ],
  },
  {
    id: "subscriptions",
    title: "Subscriptions and billing",
    blocks: [
      {
        type: "p",
        text: "Paid plans are billed monthly in advance. Your plan is made up of the Core platform, priced by team size, plus any modules you switch on. Adding people or modules changes your charge from the next billing cycle.",
      },
      {
        type: "list",
        items: [
          "Fees are exclusive of taxes, which we add where required by law.",
          "You can change your team size or modules at any time; billing follows what's enabled.",
          "Cancelling stops future renewals; fees already paid for the current period are non-refundable unless required by law.",
          "Enterprise agreements are governed by a separate order form, which prevails over these terms where they conflict.",
        ],
      },
    ],
  },
  {
    id: "your-data",
    title: "Your data",
    blocks: [
      {
        type: "p",
        text: "The employee records, payroll figures, documents and other content you put into the product belong to you. We process that content to provide the service, under our Privacy Policy. We do not sell it, and we do not use it to train third-party models.",
      },
      {
        type: "p",
        text: "You are responsible for having a lawful basis to upload your people's personal data and for the accuracy of what you enter.",
      },
    ],
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    blocks: [
      { type: "p", text: "When using the products, you agree not to:" },
      {
        type: "list",
        items: [
          "Break the law or infringe anyone's rights, including privacy and IP rights.",
          "Upload malware, attempt to breach security, or probe systems you're not authorised to test.",
          "Resell, sublicense, or provide the products to third parties outside your organisation without our consent.",
          "Interfere with the service's operation or other customers' use of it.",
        ],
      },
    ],
  },
  {
    id: "availability",
    title: "Availability and support",
    blocks: [
      {
        type: "p",
        text: "We work to keep the products available and will let you know about planned maintenance where practical. Support is available by email; Enterprise customers may have additional support commitments in their order form.",
      },
    ],
  },
  {
    id: "warranties",
    title: "Warranties and liability",
    blocks: [
      {
        type: "p",
        text: "The products are provided on a commercially reasonable basis. To the extent permitted by law, we exclude implied warranties, and our total liability arising from the agreement is limited to the fees you paid us in the twelve months before the event giving rise to the claim.",
      },
      {
        type: "p",
        text: "Nothing in these terms limits liability that cannot be limited by law.",
      },
    ],
  },
  {
    id: "termination",
    title: "Termination",
    blocks: [
      {
        type: "p",
        text: "Either party may end the agreement in line with the plan or order form. On termination we stop the service and, after a short grace period, delete or return your content on request. You can export your data before then.",
      },
    ],
  },
  {
    id: "changes",
    title: "Changes and contact",
    blocks: [
      {
        type: "p",
        text: "We may update these terms as the products evolve. If a change is material, we'll give reasonable notice. Continued use after a change means you accept the updated terms.",
      },
      {
        type: "p",
        text: "Questions? Email legal@leadmighty.com.",
      },
    ],
  },
];

export default function TermsPage() {
  return (
    <DocPage
      eyebrow="Legal / Terms of Service"
      title="Terms of Service"
      intro="The ground rules for using LeadMighty. Written to be read — plain terms for how the product, your subscription and your data work together."
      updated={UPDATED}
      sections={SECTIONS}
    />
  );
}
