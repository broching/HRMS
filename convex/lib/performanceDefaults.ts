// Seed data + defaults for the performance-appraisal module. Applied when an
// org is first seeded and when a review cycle is created without explicit
// configuration. All values are org-editable afterwards.

import type { CycleForm } from "./enums";

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

// ─── Starter appraisal-form templates ───────────────────────────────────────
// Seeded per-org as read-only `isSystemDefault` templates; HR picks one when
// creating a cycle (its `form` is copied onto the cycle). Field `id`s only need
// to be unique within a form. Scored fields (`ratingScale` + the objectives /
// competencies blocks) carry a `weightPct` that should sum to ~100 per form.
export type FormTemplateSeed = {
  name: string;
  description: string;
  form: CycleForm;
};

const RATING_5_LABELS = [
  { value: 1, label: "Below expectations" },
  { value: 2, label: "Partially meets" },
  { value: 3, label: "Meets expectations" },
  { value: 4, label: "Exceeds" },
  { value: 5, label: "Outstanding" },
];

export const DEFAULT_FORM_TEMPLATES: FormTemplateSeed[] = [
  {
    name: "Annual Performance Appraisal",
    description:
      "Full review: weighted objectives + competencies, an overall rating, reflective questions, and an employee acknowledgement.",
    form: {
      sections: [
        {
          id: "sec_objectives",
          title: "Objectives",
          description: "Weighted goals for the review period.",
          fields: [
            {
              id: "objectives",
              type: "objectives",
              label: "Objectives",
              side: "both",
              weightPct: 60,
            },
          ],
        },
        {
          id: "sec_competencies",
          title: "Competencies",
          fields: [
            {
              id: "competencies",
              type: "competencies",
              label: "Competencies",
              side: "both",
              weightPct: 30,
            },
          ],
        },
        {
          id: "sec_overall",
          title: "Overall assessment",
          fields: [
            {
              id: "overall_rating",
              type: "ratingScale",
              label: "Overall performance this cycle",
              side: "appraiser",
              scaleMax: 5,
              scaleLabels: RATING_5_LABELS,
              weightPct: 10,
              required: true,
            },
            {
              id: "achievements",
              type: "longText",
              label: "Key achievements this cycle",
              side: "self",
            },
            {
              id: "challenges",
              type: "longText",
              label: "Challenges faced",
              side: "both",
            },
            {
              id: "support",
              type: "longText",
              label: "Support needed going forward",
              side: "self",
            },
            {
              id: "manager_comments",
              type: "longText",
              label: "Appraiser comments",
              side: "appraiser",
            },
          ],
        },
        {
          id: "sec_ack",
          title: "Acknowledgement",
          fields: [
            {
              id: "employee_ack",
              type: "signature",
              label: "Employee acknowledgement",
              description: "I have reviewed and discussed this appraisal.",
              side: "self",
            },
          ],
        },
      ],
    },
  },
  {
    name: "Simple Self-Assessment",
    description:
      "Lightweight self-reflection: an overall self-rating and a few open questions. Employee-only.",
    form: {
      sections: [
        {
          id: "sec_self",
          title: "Self-assessment",
          fields: [
            {
              id: "self_rating",
              type: "ratingScale",
              label: "How would you rate your overall performance?",
              side: "self",
              scaleMax: 5,
              scaleLabels: RATING_5_LABELS,
              weightPct: 100,
              required: true,
            },
            {
              id: "went_well",
              type: "longText",
              label: "What went well?",
              side: "self",
            },
            {
              id: "improve",
              type: "longText",
              label: "What could have gone better?",
              side: "self",
            },
            {
              id: "next_goals",
              type: "longText",
              label: "Goals for the next period",
              side: "self",
            },
          ],
        },
      ],
    },
  },
  {
    name: "Probation Review",
    description:
      "End-of-probation assessment with a confirmation recommendation. Appraiser-led with an employee comment.",
    form: {
      sections: [
        {
          id: "sec_probation",
          title: "Probation assessment",
          fields: [
            {
              id: "meets_expectations",
              type: "yesNo",
              label: "Does the employee meet the role's expectations?",
              side: "appraiser",
              required: true,
            },
            {
              id: "quality",
              type: "ratingScale",
              label: "Quality of work",
              side: "appraiser",
              scaleMax: 5,
              weightPct: 34,
            },
            {
              id: "reliability",
              type: "ratingScale",
              label: "Reliability & attendance",
              side: "appraiser",
              scaleMax: 5,
              weightPct: 33,
            },
            {
              id: "teamwork",
              type: "ratingScale",
              label: "Teamwork & attitude",
              side: "appraiser",
              scaleMax: 5,
              weightPct: 33,
            },
            {
              id: "recommendation",
              type: "radio",
              label: "Recommendation",
              side: "appraiser",
              options: ["Confirm employment", "Extend probation", "Do not confirm"],
              required: true,
            },
            {
              id: "appraiser_notes",
              type: "longText",
              label: "Appraiser comments",
              side: "appraiser",
            },
            {
              id: "employee_notes",
              type: "longText",
              label: "Employee comments",
              side: "self",
            },
          ],
        },
      ],
    },
  },
  {
    name: "Peer Feedback",
    description:
      "Short peer/colleague feedback: a working-relationship rating plus strengths and areas to improve.",
    form: {
      sections: [
        {
          id: "sec_peer",
          title: "Peer feedback",
          fields: [
            {
              id: "relationship_rating",
              type: "ratingScale",
              label: "How was your experience working together?",
              side: "both",
              scaleMax: 5,
              weightPct: 100,
            },
            {
              id: "strengths",
              type: "longText",
              label: "What are their strengths?",
              side: "both",
            },
            {
              id: "improve",
              type: "longText",
              label: "What could they improve on?",
              side: "both",
            },
          ],
        },
      ],
    },
  },
  {
    name: "Quarterly Check-in",
    description:
      "Light quarterly touchpoint: overall progress rating and a few forward-looking questions.",
    form: {
      sections: [
        {
          id: "sec_checkin",
          title: "Check-in",
          fields: [
            {
              id: "progress",
              type: "ratingScale",
              label: "Overall progress this quarter",
              side: "both",
              scaleMax: 5,
              weightPct: 100,
            },
            {
              id: "wins",
              type: "longText",
              label: "Wins this quarter",
              side: "self",
            },
            {
              id: "blockers",
              type: "longText",
              label: "Blockers or challenges",
              side: "both",
            },
            {
              id: "focus",
              type: "longText",
              label: "Focus for next quarter",
              side: "both",
            },
            {
              id: "manager_notes",
              type: "longText",
              label: "Manager notes",
              side: "appraiser",
            },
          ],
        },
      ],
    },
  },
];
