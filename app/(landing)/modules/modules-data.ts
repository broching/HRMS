import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Wallet,
  Receipt,
  MapPin,
  Target,
  UsersRound,
  LineChart,
  Bell,
  ClipboardCheck,
  Plane,
  Network,
  FileText,
  ShieldCheck,
  UserPlus,
  UserX,
  KeyRound,
  SlidersHorizontal,
  GitBranch,
  CalendarCheck,
  BookOpenCheck,
  Smartphone,
  Ban,
  Calculator,
  Landmark,
  Layers,
  Clock,
  FileSpreadsheet,
  History,
  Camera,
  Globe,
  Route,
  Gauge,
  Boxes,
  QrCode,
  CalendarRange,
  Repeat,
  AlarmClockCheck,
  Pencil,
  Scale,
  MessageSquareOff,
  BarChart3,
  Megaphone,
  Link2,
  Kanban,
  Lock,
  Database,
  Filter,
} from "lucide-react";

// The nine module "specification sheets." Order here is the sheet order —
// SHEET 01 / 09 through 09 / 09 — and drives prev/next pagination.

export type ModuleFeature = { icon: LucideIcon; title: string; body: string };
export type ModuleStep = { title: string; body: string };

export type ModuleDef = {
  slug: string;
  name: string;
  icon: LucideIcon;
  /* Sheet ink — the whole page re-inks to this hue. */
  hue: string;
  hue2: string;
  /* App path shown in the browser frame. */
  path: string;
  /* Which live recreation to render. */
  screenKey:
    | "dashboard"
    | "people"
    | "leave"
    | "payroll"
    | "claims"
    | "attendance"
    | "performance"
    | "recruitment"
    | "reports";
  /* Headline: plain lead + accent tail. */
  headline: [string, string];
  intro: string;
  /* Three quick mono facts under the intro. */
  facts: string[];
  /* Two hand-written callouts around the hero frame. */
  callouts: [string, string];
  features: ModuleFeature[];
  steps: ModuleStep[];
  related: string[];
  metaDescription: string;
};

export const MODULES: ModuleDef[] = [
  {
    slug: "dashboard",
    name: "Home",
    icon: LayoutDashboard,
    hue: "#1e56e8",
    hue2: "#4b82ff",
    path: "/dashboard",
    screenKey: "dashboard",
    headline: ["The whole day,", "on one screen."],
    intro:
      "The first thing everyone sees when they sign in: their leave balance, next payday, what's waiting on their approval, and who's out today. No manual, no training — new hires find their way around in the first minute.",
    facts: ["Zero-training onboarding", "Approvals surfaced first", "Works on any phone"],
    callouts: ["everything that needs you, in one glance", "installs like an app — no app store"],
    features: [
      {
        icon: Gauge,
        title: "Personal snapshot",
        body: "Leave left, next payday and open requests — each person's numbers, not a generic dashboard.",
      },
      {
        icon: ClipboardCheck,
        title: "Approvals queue",
        body: "Leave, claims and corrections waiting on you are pinned to the top until they're cleared.",
      },
      {
        icon: Plane,
        title: "Who's away today",
        body: "See at a glance who's on leave, remote or off — before you book the meeting.",
      },
      {
        icon: CalendarRange,
        title: "My schedule",
        body: "This week's roster shifts front and centre, so nobody screenshots the duty board again.",
      },
      {
        icon: Smartphone,
        title: "Installable PWA",
        body: "Add it to any home screen and it opens like a native app — one build, every device.",
      },
      {
        icon: Bell,
        title: "Email notifications",
        body: "Each person picks what they want to hear about, with links that land on the exact record.",
      },
    ],
    steps: [
      {
        title: "Sign in",
        body: "One login for staff, managers and HR — the screen adapts to what each role can do.",
      },
      {
        title: "See what needs you",
        body: "Balances, approvals and today's roster are already there, freshest first.",
      },
      {
        title: "Act in one tap",
        body: "Apply, approve, clock in or submit a claim without hunting through menus.",
      },
    ],
    related: ["leave", "claims", "attendance"],
    metaDescription:
      "The LeadMightyHR home screen: leave balances, payday, approvals and today's roster on one screen, for every employee.",
  },
  {
    slug: "people",
    name: "People",
    icon: Users,
    hue: "#e8850c",
    hue2: "#f2a93c",
    path: "/employees/org-chart",
    screenKey: "people",
    headline: ["One record of truth", "for who's who."],
    intro:
      "Employee records, documents and a live org chart that redraws itself as people join, move teams and get promoted. Everyone can see how the company fits together — while the sensitive fields stay with the people cleared to see them.",
    facts: ["Drag-to-restructure org chart", "Field-level privacy", "Invite by email or username"],
    callouts: ["drag a card to change who reports to whom", "salary fields hidden from everyone who shouldn't see them"],
    features: [
      {
        icon: Network,
        title: "Living org chart",
        body: "Drag a whole team under a new manager and the reporting lines redraw themselves — with a guard against loops.",
      },
      {
        icon: FileText,
        title: "Records & documents",
        body: "Contracts, IDs and certifications on each profile, viewable in the browser without downloading.",
      },
      {
        icon: ShieldCheck,
        title: "Field-level privacy",
        body: "The directory is open to everyone; pay, IDs and personal details are redacted by role automatically.",
      },
      {
        icon: UserPlus,
        title: "Invites that just work",
        body: "Add people by email or username — they sign in and land on a profile that's already theirs.",
      },
      {
        icon: UserX,
        title: "Clean offboarding",
        body: "Deactivating someone ends their access everywhere at once, and keeps their history for your records.",
      },
      {
        icon: KeyRound,
        title: "Roles & permissions",
        body: "Build your own roles — decide exactly who runs payroll, who approves claims, who only views.",
      },
    ],
    steps: [
      {
        title: "Invite your team",
        body: "By email or username, one at a time or in bulk — duplicates are caught before they land.",
      },
      {
        title: "The chart draws itself",
        body: "Set who reports to whom once; every join, move and promotion updates the picture live.",
      },
      {
        title: "Keep one record true",
        body: "Payroll, leave and attendance all read from the same profile — nothing is re-keyed.",
      },
    ],
    related: ["dashboard", "recruitment", "reports"],
    metaDescription:
      "Employee records, documents and a live drag-to-restructure org chart with field-level privacy — the People module of LeadMightyHR.",
  },
  {
    slug: "leave",
    name: "Leave",
    icon: CalendarDays,
    hue: "#1e56e8",
    hue2: "#4b82ff",
    path: "/leave/calendar",
    screenKey: "leave",
    headline: ["Time off, without", "the email chains."],
    intro:
      "Write your leave policy into the system once — entitlements, proration, carry-forward, seniority tiers — and it runs itself. Staff request from their phone, approvers get it in order, and a shared calendar keeps everyone honest about who's away.",
    facts: ["Policy engine, not a spreadsheet", "Ordered approval chains", "Every balance change audited"],
    callouts: ["your policy, enforced automatically", "the whole team's July at a glance"],
    features: [
      {
        icon: SlidersHorizontal,
        title: "Policy engine",
        body: "Entitlements, proration for joiners, carry-forward with expiry dates and seniority top-ups — set once, applied everywhere.",
      },
      {
        icon: GitBranch,
        title: "Approval chains",
        body: "Manager, department head, a role or a named person — in the order you choose, with extra steps for longer leave.",
      },
      {
        icon: CalendarCheck,
        title: "Shared calendar",
        body: "One calendar shows who's away and when, colour-coded by leave type, before anyone double-books.",
      },
      {
        icon: BookOpenCheck,
        title: "Audited balances",
        body: "HR can adjust any balance, and every change lands in a ledger with who, when and why.",
      },
      {
        icon: Smartphone,
        title: "Built for phones",
        body: "Requesting three days off takes three taps from the home screen — no laptop required.",
      },
      {
        icon: Ban,
        title: "Guardrails built in",
        body: "No backdating, no overdrawn balances, no requests that skip the chain — quietly enforced.",
      },
    ],
    steps: [
      {
        title: "Set your policy once",
        body: "Leave types, entitlements and the approval chain for each — it takes an afternoon, not a quarter.",
      },
      {
        title: "Staff request",
        body: "Pick the days, see the balance update live, submit. The right approver is already notified.",
      },
      {
        title: "Managers approve in a tap",
        body: "Each step in the chain clears in order, and the calendar updates the moment it's approved.",
      },
    ],
    related: ["dashboard", "payroll", "attendance"],
    metaDescription:
      "A leave policy engine with proration, carry-forward and seniority tiers, ordered approval chains and a shared team calendar.",
  },
  {
    slug: "payroll",
    name: "Payroll",
    icon: Wallet,
    hue: "#0ea5a0",
    hue2: "#18b8d6",
    path: "/hr-lounge/payroll",
    screenKey: "payroll",
    headline: ["Payroll that already", "knows Singapore."],
    intro:
      "CPF, SDL and payslips handled for you. Run the month as a three-step wizard — open, review, finalise — with approved overtime and claims pulled in automatically, and every figure traceable straight back to the person it belongs to.",
    facts: ["CPF + SDL computed", "3-step monthly run", "OT & claims flow in"],
    callouts: ["CPF employee + employer, computed for you", "every line traceable to a person"],
    features: [
      {
        icon: Calculator,
        title: "CPF done right",
        body: "Employee and employer contributions computed by age band and wage — checked against the current tables.",
      },
      {
        icon: Landmark,
        title: "SDL and statutory lines",
        body: "The small statutory levies nobody remembers are on every payslip automatically.",
      },
      {
        icon: Layers,
        title: "Adjustments, then a snapshot",
        body: "Bonuses, deductions and corrections stage as inputs; finalising freezes an immutable payslip record.",
      },
      {
        icon: Clock,
        title: "Overtime flows in",
        body: "Approved OT from the roster arrives priced and ready — no export, no re-keying hours.",
      },
      {
        icon: Receipt,
        title: "Claims settle here",
        body: "Approved expense claims ride the same run, so reimbursement is one payment, not a second process.",
      },
      {
        icon: History,
        title: "Every run kept",
        body: "Past months stay finalised and browsable — payslips, totals and who ran them.",
      },
    ],
    steps: [
      {
        title: "Open the month",
        body: "Everyone active is pulled in with their salary, plus this month's OT and approved claims.",
      },
      {
        title: "Review each person",
        body: "Adjust bonuses or deductions where needed; CPF and SDL recompute as you type.",
      },
      {
        title: "Finalise and issue",
        body: "One click freezes the run and issues payslips — traceable, snapshot-accurate, done.",
      },
    ],
    related: ["claims", "attendance", "reports"],
    metaDescription:
      "Singapore-first payroll: CPF and SDL computed for you, a three-step monthly run, and overtime and claims pulled in automatically.",
  },
  {
    slug: "claims",
    name: "Claims",
    icon: Receipt,
    hue: "#7a5af0",
    hue2: "#9a7bff",
    path: "/claims",
    screenKey: "claims",
    headline: ["Claims that pay", "themselves out."],
    intro:
      "Snap a receipt in any currency. It converts to your office's base currency, routes to the approvers your rules choose, and settles straight through payroll — no spreadsheet in the middle, no chasing anyone for a signature.",
    facts: ["Any currency in, SGD out", "Rule-matched approvers", "Settles via payroll"],
    callouts: ["¥48,000 becomes S$432.10 — automatically", "it already knows who signs off"],
    features: [
      {
        icon: Camera,
        title: "Snap and submit",
        body: "Photograph the receipt, pick a category, done. The receipt stays attached and viewable in the browser.",
      },
      {
        icon: Globe,
        title: "Multi-currency native",
        body: "Spend in yen, bill in dollars — every claim converts to the office's base currency at submission.",
      },
      {
        icon: Route,
        title: "Approval flows that match",
        body: "Different flows for different roles or people, with a default catch-all — the claim finds its own path.",
      },
      {
        icon: Gauge,
        title: "Thresholds and caps",
        body: "Per-claim limits and per-period submission caps are enforced at the door, not discovered at audit.",
      },
      {
        icon: Boxes,
        title: "Batches move as one",
        body: "Submit a trip's expenses together and the batch advances through approvers as a single unit.",
      },
      {
        icon: Wallet,
        title: "Paid with payroll",
        body: "Approved claims land in the month's payroll run — one payment, one payslip line, no second transfer.",
      },
    ],
    steps: [
      {
        title: "Snap the receipt",
        body: "From a phone, in any currency, seconds after the meal ends.",
      },
      {
        title: "It routes itself",
        body: "Your rules pick the approvers; each one clears it in a tap, in order.",
      },
      {
        title: "It pays out with payroll",
        body: "The approved amount joins the next run and appears on the payslip.",
      },
    ],
    related: ["payroll", "dashboard", "leave"],
    metaDescription:
      "Multi-currency expense claims with rule-matched approval flows, thresholds and caps — settled straight through payroll.",
  },
  {
    slug: "attendance",
    name: "Attendance",
    icon: MapPin,
    hue: "#1e56e8",
    hue2: "#4b82ff",
    path: "/attendance",
    screenKey: "attendance",
    headline: ["A time clock in", "everyone's pocket."],
    intro:
      "A rotating QR code and a GPS check turn any phone into an attendance terminal — no turnstiles to buy. Behind it sits a roster with weekly patterns that fill themselves in, and overtime that flows to payroll already approved.",
    facts: ["QR + GPS, no hardware", "Self-filling weekly roster", "OT priced into payroll"],
    callouts: ["print the poster, stick it by the door", "the code rotates — no photo-and-forward"],
    features: [
      {
        icon: QrCode,
        title: "Rotating QR poster",
        body: "Print one poster per office. The code refreshes every 30 seconds, so it can't be screenshotted and shared.",
      },
      {
        icon: MapPin,
        title: "GPS geofence",
        body: "Clock-ins are checked against the office's location — within range counts, elsewhere gets flagged.",
      },
      {
        icon: CalendarRange,
        title: "Roster board",
        body: "Plan shifts on a day or week board, drag to adjust, and let everyone see their own schedule.",
      },
      {
        icon: Repeat,
        title: "Patterns fill the week",
        body: "Set each person's usual week once and the roster writes itself — override only the exceptions.",
      },
      {
        icon: AlarmClockCheck,
        title: "Overtime, scheduled first",
        body: "Planned OT sits on the roster; actual clock times confirm it, and payroll pulls it in priced.",
      },
      {
        icon: Pencil,
        title: "Tidy corrections",
        body: "Forgot to clock out? Corrections go through approval and the daily record stays clean for payroll.",
      },
    ],
    steps: [
      {
        title: "Print the poster",
        body: "One QR poster by the door per office — that's the only installation there is.",
      },
      {
        title: "The team scans in",
        body: "Phone camera, GPS check, clocked in — 9:02 AM, Marina Bay office, within range.",
      },
      {
        title: "Payroll gets clean hours",
        body: "Days close themselves, variances get flagged, and approved OT arrives in the payroll run.",
      },
    ],
    related: ["payroll", "leave", "dashboard"],
    metaDescription:
      "QR + GPS attendance with no hardware, a self-filling weekly roster, and overtime that flows into payroll already approved.",
  },
  {
    slug: "performance",
    name: "Performance",
    icon: Target,
    hue: "#7a5af0",
    hue2: "#9a7bff",
    path: "/hr-lounge/performance",
    screenKey: "performance",
    headline: ["Reviews people", "actually finish."],
    intro:
      "Run appraisal cycles with weighted objectives and competencies — 70/30 or whatever split fits — plus anonymous 360° feedback from the people who actually work together. Scores roll up into charts HR can act on, not folders nobody opens.",
    facts: ["Weighted 70/30 scoring", "Anonymous 360° feedback", "Cycle-over-cycle charts"],
    callouts: ["objectives 70%, competencies 30% — your split", "feedback stays anonymous, always"],
    features: [
      {
        icon: Target,
        title: "Appraisal cycles",
        body: "Open a cycle, pick participants, set the window — everyone knows what's due and when.",
      },
      {
        icon: Scale,
        title: "Weighted scoring",
        body: "Objectives and competencies each carry a weight, and each objective its own — the final score computes itself.",
      },
      {
        icon: MessageSquareOff,
        title: "Anonymous 360°",
        body: "Peers give honest feedback because names never travel with it — not to managers, not to HR.",
      },
      {
        icon: BarChart3,
        title: "Results as charts",
        body: "Distributions, team averages and outliers in charts — the conversation starts from the same picture.",
      },
      {
        icon: UsersRound,
        title: "Everyone in the loop",
        body: "Participants see their objectives and scores when released — no printouts, no surprise ratings.",
      },
      {
        icon: History,
        title: "Cycles compared",
        body: "H1 against H2, this year against last — growth is visible, not anecdotal.",
      },
    ],
    steps: [
      {
        title: "Open a cycle",
        body: "Name it, set the weights and the window, add participants.",
      },
      {
        title: "Everyone scores",
        body: "Self, manager and anonymous peers — each from their own view, on their own time.",
      },
      {
        title: "See the story",
        body: "Weighted results roll up into charts, ready for the conversation that matters.",
      },
    ],
    related: ["people", "reports", "dashboard"],
    metaDescription:
      "Appraisal cycles with weighted objectives and competencies, anonymous 360° feedback and results that roll up into charts.",
  },
  {
    slug: "recruitment",
    name: "Recruitment",
    icon: UsersRound,
    hue: "#e8850c",
    hue2: "#f2a93c",
    path: "/hr-lounge/recruitment",
    screenKey: "recruitment",
    headline: ["From job post", "to first day."],
    intro:
      "Post a role and a public careers board goes live on your own URL — candidates apply without creating an account. Behind it, a pipeline tracks every candidate from applied to offer, and the hire becomes an employee without re-typing a thing.",
    facts: ["Public board, no candidate login", "Pipeline from applied to offer", "Hire → employee in one step"],
    callouts: ["your careers page, live at your own URL", "applicants never see a login wall"],
    features: [
      {
        icon: Megaphone,
        title: "Post once, it's live",
        body: "Write the role and it appears on your public board immediately — no webmaster required.",
      },
      {
        icon: Globe,
        title: "A board on your URL",
        body: "A clean, hosted careers page at boards/your-company — share one link everywhere you hire.",
      },
      {
        icon: Link2,
        title: "Frictionless applying",
        body: "Candidates apply with a form, not an account — every application lands in the pipeline instantly.",
      },
      {
        icon: Kanban,
        title: "Pipeline stages",
        body: "Applied, interview, offer — drag candidates along as they progress, nobody falls through.",
      },
      {
        icon: Lock,
        title: "Hiring stays private",
        body: "Only people with recruitment permission see candidates, salaries discussed, or notes.",
      },
      {
        icon: UserPlus,
        title: "Offer to onboarding",
        body: "When they accept, the candidate record becomes an employee profile — day one is already set up.",
      },
    ],
    steps: [
      {
        title: "Post the role",
        body: "Title, description, type — and the public board updates the moment you save.",
      },
      {
        title: "Candidates flow in",
        body: "Every application lands in the pipeline, sorted by stage, with the details attached.",
      },
      {
        title: "Track to hire",
        body: "Move them through interview and offer; the winner walks into a ready-made profile.",
      },
    ],
    related: ["people", "dashboard", "reports"],
    metaDescription:
      "A candidate pipeline plus a public careers board hosted on your own URL — candidates apply with no login, hires become employees in one step.",
  },
  {
    slug: "reports",
    name: "Reports",
    icon: LineChart,
    hue: "#0ea5a0",
    hue2: "#18b8d6",
    path: "/hr-lounge/reports",
    screenKey: "reports",
    headline: ["Answers, not", "another export."],
    intro:
      "Headcount, attrition, leave and payroll cost — charted live from the same records the rest of the system runs on. And when someone upstairs wants it their way, a report builder lets you pick the dataset, shape it and export to CSV or Excel.",
    facts: ["Live statistics dashboards", "Build-your-own reports", "CSV & Excel export"],
    callouts: ["numbers from the system of record — not a copy", "shaped exactly how finance asked"],
    features: [
      {
        icon: BarChart3,
        title: "Statistics that stay current",
        body: "Headcount, attrition, leave and payroll dashboards read live data — never a stale snapshot.",
      },
      {
        icon: Database,
        title: "Pick your dataset",
        body: "Employees, leave, claims, payroll, attendance — start from the records you actually need.",
      },
      {
        icon: Filter,
        title: "Shape it your way",
        body: "Choose the fields, add the filters, order the columns — the report is yours, not a template.",
      },
      {
        icon: FileSpreadsheet,
        title: "Export clean files",
        body: "CSV for systems, Excel for people — either way the file opens right the first time.",
      },
      {
        icon: LineChart,
        title: "Trends over time",
        body: "Month-on-month movement in headcount and cost, so the trend is visible before it's a problem.",
      },
      {
        icon: ShieldCheck,
        title: "Respectful of permissions",
        body: "Reports only surface what the person running them is allowed to see — same rules as everywhere else.",
      },
    ],
    steps: [
      {
        title: "Pick a dataset",
        body: "Start from employees, leave, payroll, claims or attendance.",
      },
      {
        title: "Shape it",
        body: "Fields, filters, ordering — watch the preview update as you go.",
      },
      {
        title: "Export or keep it live",
        body: "Download CSV/Excel for the meeting, or come back to the live version anytime.",
      },
    ],
    related: ["payroll", "people", "performance"],
    metaDescription:
      "Live HR statistics — headcount, attrition, leave, payroll — plus a build-your-own report exporter with CSV and Excel output.",
  },
];

export const MODULE_BY_SLUG: Record<string, ModuleDef> = Object.fromEntries(
  MODULES.map((m) => [m.slug, m]),
);
