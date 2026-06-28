/**
 * Singapore CPF (Central Provident Fund) computation — pure & unit-testable.
 *
 * IMPORTANT: the rates and Ordinary-Wage ceiling below are simplified, default
 * values intended as a sensible starting point. CPF rates change by Budget year
 * and vary by age band, residency status (Citizen vs PR year 1/2), and wage
 * level. Verify against the current CPF Board / IRAS tables and make these
 * org-configurable before relying on them for actual disbursement.
 *
 * Model summary:
 *  - CPF is charged on Ordinary Wages (monthly), capped at the OW ceiling.
 *  - Total contribution = employee share (deducted from pay) + employer share
 *    (an employer cost, on top of gross — NOT deducted from the employee).
 *  - Only Citizens / PRs contribute; foreigners/exempt do not.
 */

export type CpfStatusValue = "citizen_pr" | "foreigner" | "exempt";

// Ordinary Wage monthly ceiling, in cents. (SG: rising to S$8,000 from 2026.)
export const DEFAULT_OW_CEILING_CENTS = 800_000;

interface AgeBand {
  // upper bound (inclusive) of the band, in years; Infinity for the top band
  maxAge: number;
  employeeRate: number;
  employerRate: number;
}

// Default age-banded rates for Citizens / PRs (representative values).
export const DEFAULT_CPF_BANDS: AgeBand[] = [
  { maxAge: 55, employeeRate: 0.2, employerRate: 0.17 },
  { maxAge: 60, employeeRate: 0.17, employerRate: 0.155 },
  { maxAge: 65, employeeRate: 0.115, employerRate: 0.12 },
  { maxAge: 70, employeeRate: 0.075, employerRate: 0.09 },
  { maxAge: Infinity, employeeRate: 0.05, employerRate: 0.075 },
];

export interface CpfConfig {
  owCeilingCents: number;
  bands: AgeBand[];
}

export const DEFAULT_CPF_CONFIG: CpfConfig = {
  owCeilingCents: DEFAULT_OW_CEILING_CENTS,
  bands: DEFAULT_CPF_BANDS,
};

export interface CpfResult {
  cpfableWageCents: number; // wage subject to CPF after ceiling
  employeeCpfCents: number;
  employerCpfCents: number;
  employeeRate: number;
  employerRate: number;
}

function bandForAge(age: number, bands: AgeBand[]): AgeBand {
  return bands.find((b) => age <= b.maxAge) ?? bands[bands.length - 1];
}

/** Whole years between `dobISO` and `onDateISO` (both "YYYY-MM-DD"). */
export function ageOn(dobISO: string, onDateISO: string): number {
  const [by, bm, bd] = dobISO.split("-").map(Number);
  const [yy, ym, yd] = onDateISO.split("-").map(Number);
  let age = yy - by;
  if (ym < bm || (ym === bm && yd < bd)) age -= 1;
  return Math.max(0, age);
}

/**
 * Compute CPF for a month.
 * @param ordinaryWageCents gross CPF-eligible monthly wage (base + cpfable allowances)
 * @param age employee age at the pay-period end
 * @param status residency status
 */
export function computeCpf(
  ordinaryWageCents: number,
  age: number,
  status: CpfStatusValue,
  config: CpfConfig = DEFAULT_CPF_CONFIG,
): CpfResult {
  if (status !== "citizen_pr" || ordinaryWageCents <= 0) {
    return {
      cpfableWageCents: 0,
      employeeCpfCents: 0,
      employerCpfCents: 0,
      employeeRate: 0,
      employerRate: 0,
    };
  }
  const cpfableWageCents = Math.min(ordinaryWageCents, config.owCeilingCents);
  const band = bandForAge(age, config.bands);
  return {
    cpfableWageCents,
    employeeCpfCents: Math.round(cpfableWageCents * band.employeeRate),
    employerCpfCents: Math.round(cpfableWageCents * band.employerRate),
    employeeRate: band.employeeRate,
    employerRate: band.employerRate,
  };
}
