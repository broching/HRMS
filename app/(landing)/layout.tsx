import type { Metadata } from "next";
import { Bricolage_Grotesque, Caveat } from "next/font/google";
import "./landing.css";

// Display face for the marketing surface only — a characterful grotesque that
// carries the "Mighty" personality without touching the app's Inter/Lora tokens.
const fontDisplay = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

// A single handwritten face, used once — for the signed note from the team.
// A deliberate human fingerprint on an otherwise precise, drafted page.
const fontHand = Caveat({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-hand",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LeadMighty — Software that makes business mighty",
  description:
    "LeadMighty builds a growing suite of B2B SaaS products on one shared spine. Starting with LeadMightyHR — the all-in-one HR platform for modern teams.",
};

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${fontDisplay.variable} ${fontHand.variable} lm-root`}>
      {children}
    </div>
  );
}
