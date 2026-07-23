import type { Ir8aCategory } from "./enums";

// System-default payroll items. Each common earning/allowance ships with its
// appropriate IR8A income classification and a sensible CPF default, so adding
// one is a single pick — no manual classification needed. Niche items are added
// via the "Custom" path, where the user classifies them at creation time.
//
// This catalogue is shared by the payroll engine (falls back to these defaults
// when resolving an earning's IR8A category) and the UI (populates the item
// picker + seeds the IR8A settings tab). Deductions and employer contributions
// carry no IR8A income category and are intentionally not listed here.
export interface PayrollItemPreset {
  label: string;
  category: Ir8aCategory;
  // Default CPF Ordinary-Wage treatment when the item is added as an allowance
  // or addition. HR can still toggle it per employee.
  cpfable: boolean;
}

export const PAYROLL_ITEM_PRESETS: PayrollItemPreset[] = [
  // Allowances — taxable, generally CPF-able when paid as a fixed monthly cash
  // allowance (transport/meal/handphone reimbursements against receipts differ,
  // but the fixed-allowance default is the common case).
  { label: "Transport allowance", category: "allowancesTaxable", cpfable: true },
  { label: "Meal allowance", category: "allowancesTaxable", cpfable: true },
  { label: "Housing allowance", category: "allowancesTaxable", cpfable: true },
  { label: "Handphone allowance", category: "allowancesTaxable", cpfable: true },
  { label: "Shift allowance", category: "allowancesTaxable", cpfable: true },
  { label: "Attendance allowance", category: "allowancesTaxable", cpfable: true },
  { label: "Laundry allowance", category: "allowancesTaxable", cpfable: true },
  { label: "Entertainment allowance", category: "allowancesTaxable", cpfable: true },

  // Bonuses.
  { label: "Performance bonus", category: "bonus", cpfable: true },
  { label: "Annual wage supplement (AWS)", category: "bonus", cpfable: true },
  { label: "13th month bonus", category: "bonus", cpfable: true },
  { label: "Retention bonus", category: "bonus", cpfable: true },
  { label: "Sign-on bonus", category: "bonus", cpfable: true },

  // Commission / incentives.
  { label: "Commission", category: "commission", cpfable: true },
  { label: "Sales incentive", category: "commission", cpfable: true },

  // Director's fees — approved at an AGM, not CPF-able.
  { label: "Director's fee", category: "directorsFee", cpfable: false },

  // Gratuity / ex-gratia (e.g. long-service, retirement gratuity).
  { label: "Gratuity", category: "gratuityExGratia", cpfable: false },
  { label: "Ex-gratia payment", category: "gratuityExGratia", cpfable: false },

  // Other taxable income that doesn't fit the fields above.
  { label: "Benefits-in-kind", category: "otherIncome", cpfable: false },
];

// normalized label → category, for O(1) engine + settings lookups.
export const PRESET_CATEGORY_BY_LABEL: Map<string, Ir8aCategory> = new Map(
  PAYROLL_ITEM_PRESETS.map((p) => [p.label.trim().toLowerCase(), p.category]),
);
