// Seed data + defaults for the performance-appraisal module. Applied when an
// org is first seeded and when a review cycle is created without explicit
// configuration. All values are org-editable afterwards.

export const DEFAULT_OBJECTIVES_WEIGHT_PCT = 70;
export const DEFAULT_COMPETENCIES_WEIGHT_PCT = 30;

// Qualitative bands applied to a numeric overall rating (out of 5). Highest
// matching `min` wins.
export const DEFAULT_RATING_BANDS = [
  { min: 0, label: "Below expectations" },
  { min: 2.5, label: "Meets some expectations" },
  { min: 3.5, label: "Meets expectations" },
  { min: 4, label: "Above expectations" },
  { min: 4.5, label: "Exceptional" },
] as const;

// Appraisal questionnaire — answered in parallel by the employee (self) and the
// appraiser.
export const DEFAULT_QUESTIONNAIRE = [
  "What do you think of your overall performance?",
  "What are the challenges faced?",
  "What are your key achievements this cycle?",
  "What support do you need going forward?",
] as const;

// 360-feedback questions asked of every assigned giver.
export const DEFAULT_360_QUESTIONS = [
  "How was your experience working with your colleague?",
  "What is/are your colleague's strengths?",
  "What could your colleague improve on?",
] as const;

// Starter competency library, grouped by category. Each competency carries a
// relative weight within the competency section and Level 1–5 descriptors.
type SeedCompetency = {
  category: string;
  name: string;
  description: string;
  weightPct: number;
};

export const DEFAULT_COMPETENCIES: SeedCompetency[] = [
  {
    category: "Functional Knowledge",
    name: "Own your expertise",
    description:
      "Identifies gaps in current and future knowledge areas and closes those gaps.",
    weightPct: 20,
  },
  {
    category: "People Development",
    name: "Set a good example",
    description:
      "Motivates and encourages others by recognizing contribution and accentuating the strengths and potential of peers and/or direct reports.",
    weightPct: 20,
  },
  {
    category: "Self management skills",
    name: "Drive",
    description:
      "Takes ownership, stays resilient under pressure, and consistently delivers on commitments.",
    weightPct: 20,
  },
  {
    category: "Collaboration skills",
    name: "Positive working relationships",
    description:
      "Builds trust and works effectively across teams to achieve shared goals.",
    weightPct: 20,
  },
  {
    category: "Business intelligence",
    name: "Lateral thinking — outside the box",
    description:
      "Approaches problems creatively and connects insights across domains to drive better decisions.",
    weightPct: 20,
  },
];

// Behaviour descriptors applied to every seeded competency (Level 1–5).
export const DEFAULT_LEVEL_DESCRIPTORS = [
  { level: 1, description: "Developing — applies the competency with guidance." },
  { level: 2, description: "Foundational — applies the competency in familiar situations." },
  { level: 3, description: "Proficient — applies the competency independently." },
  { level: 4, description: "Advanced — applies the competency in complex situations and coaches others." },
  { level: 5, description: "Expert — sets direction and is a role model across the org." },
];
