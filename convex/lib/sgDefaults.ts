import type { LeaveCategory, ClaimCategory } from "./enums";

/**
 * Singapore default statutory leave types and public holidays, seeded into
 * each new organization (see seed.ts). All values are editable in-app, so
 * these are sensible starting points rather than the source of truth.
 */

type LeaveTypeSeed = {
  name: string;
  code: string;
  category: LeaveCategory;
  paid: boolean;
  defaultEntitlementDays: number;
  accrualMethod: "none" | "monthly" | "anniversary";
  allowCarryForward: boolean;
  maxCarryForwardDays?: number;
  allowHalfDay: boolean;
  requiresAttachment: boolean;
  requiresApproval: boolean;
  color: string;
  active: boolean;
};

export const SG_LEAVE_TYPES: LeaveTypeSeed[] = [
  {
    name: "Annual Leave",
    code: "AL",
    category: "annual",
    paid: true,
    defaultEntitlementDays: 14,
    accrualMethod: "none",
    allowCarryForward: true,
    maxCarryForwardDays: 7,
    allowHalfDay: true,
    requiresAttachment: false,
    requiresApproval: true,
    color: "#3b82f6",
    active: true,
  },
  {
    name: "Sick Leave",
    code: "SL",
    category: "sick",
    paid: true,
    defaultEntitlementDays: 14,
    accrualMethod: "none",
    allowCarryForward: false,
    allowHalfDay: false,
    requiresAttachment: true,
    requiresApproval: true,
    color: "#ef4444",
    active: true,
  },
  {
    name: "Hospitalisation Leave",
    code: "HL",
    category: "hospitalisation",
    paid: true,
    defaultEntitlementDays: 60,
    accrualMethod: "none",
    allowCarryForward: false,
    allowHalfDay: false,
    requiresAttachment: true,
    requiresApproval: true,
    color: "#f97316",
    active: true,
  },
  {
    name: "Childcare Leave",
    code: "CCL",
    category: "childcare",
    paid: true,
    defaultEntitlementDays: 6,
    accrualMethod: "none",
    allowCarryForward: false,
    allowHalfDay: true,
    requiresAttachment: false,
    requiresApproval: true,
    color: "#22c55e",
    active: true,
  },
  {
    name: "Maternity Leave",
    code: "ML",
    category: "maternity",
    paid: true,
    defaultEntitlementDays: 112,
    accrualMethod: "none",
    allowCarryForward: false,
    allowHalfDay: false,
    requiresAttachment: false,
    requiresApproval: true,
    color: "#ec4899",
    active: true,
  },
  {
    name: "Paternity Leave",
    code: "PL",
    category: "paternity",
    paid: true,
    defaultEntitlementDays: 14,
    accrualMethod: "none",
    allowCarryForward: false,
    allowHalfDay: false,
    requiresAttachment: false,
    requiresApproval: true,
    color: "#8b5cf6",
    active: true,
  },
  {
    name: "Unpaid Leave",
    code: "UL",
    category: "unpaid",
    paid: false,
    defaultEntitlementDays: 0,
    accrualMethod: "none",
    allowCarryForward: false,
    allowHalfDay: true,
    requiresAttachment: false,
    requiresApproval: true,
    color: "#6b7280",
    active: true,
  },
];

type ClaimTypeSeed = {
  name: string;
  category: ClaimCategory;
  requiresReceipt: boolean;
  active: boolean;
};

export const CLAIM_TYPE_DEFAULTS: ClaimTypeSeed[] = [
  { name: "Medical", category: "medical", requiresReceipt: true, active: true },
  { name: "Travel", category: "travel", requiresReceipt: true, active: true },
  { name: "Meals", category: "meals", requiresReceipt: true, active: true },
  {
    name: "Office Purchases",
    category: "office",
    requiresReceipt: true,
    active: true,
  },
  { name: "Mileage", category: "mileage", requiresReceipt: false, active: true },
  {
    name: "Training",
    category: "training",
    requiresReceipt: true,
    active: true,
  },
  {
    name: "Entertainment",
    category: "entertainment",
    requiresReceipt: true,
    active: true,
  },
];

// Singapore gazetted public holidays for 2026 (editable per org).
export const SG_HOLIDAYS_2026: { date: string; name: string }[] = [
  { date: "2026-01-01", name: "New Year's Day" },
  { date: "2026-02-17", name: "Chinese New Year" },
  { date: "2026-02-18", name: "Chinese New Year" },
  { date: "2026-03-21", name: "Hari Raya Puasa" },
  { date: "2026-04-03", name: "Good Friday" },
  { date: "2026-05-01", name: "Labour Day" },
  { date: "2026-05-27", name: "Hari Raya Haji" },
  { date: "2026-05-31", name: "Vesak Day" },
  { date: "2026-08-09", name: "National Day" },
  { date: "2026-11-08", name: "Deepavali" },
  { date: "2026-12-25", name: "Christmas Day" },
];
