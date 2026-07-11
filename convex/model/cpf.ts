/**
 * Singapore CPF (Central Provident Fund) computation — pure & unit-testable.
 *
 * IMPORTANT: the rates and Ordinary-Wage ceiling below are simplified, default
 * values intended as a sensible starting point. CPF rates change by Budget year
 * and vary by age band, residency status (Citizen vs PR year 1/2/3+), and wage
 * level. Verify against the current CPF Board / IRAS tables before relying on
 * them for actual disbursement.
 *
 * Model summary:
 *  - CPF is charged on Ordinary Wages (monthly), capped at the OW ceiling.
 *  - Total contribution = employee share (deducted from pay) + employer share
 *    (an employer cost, on top of gross — NOT deducted from the employee).
 *  - Citizens contribute at the full age-banded rates.
 *  - Permanent Residents contribute at *graduated* rates for their first two
 *    years, then the full rates from the 3rd year onwards:
 *      • Year 1: employer 4%,  employee 5%
 *      • Year 2: employer 9%,  employee 15%
 *      • Year 3 onwards: full age-banded rates (17% / 20% at age ≤55).
 *  - Foreigners (work-pass holders) and exempt staff do NOT contribute (0%).
 */

// `citizen_pr` is a legacy value (pre-split) treated as `citizen`.
export type CpfStatusValue =
  | "citizen"
  | "pr"
  | "foreigner"
  | "exempt"
  | "citizen_pr";

// Ordinary Wage monthly ceiling, in cents. (SG: rising to S$8,000 from 2026.)
export const DEFAULT_OW_CEILING_CENTS = 800_000;

interface AgeBand {
  // upper bound (inclusive) of the band, in years; Infinity for the top band
  maxAge: number;
  employeeRate: number;
  employerRate: number;
}

// Default age-banded rates for Citizens / 3rd-year+ PRs (representative values).
export const DEFAULT_CPF_BANDS: AgeBand[] = [
  { maxAge: 55, employeeRate: 0.2, employerRate: 0.17 },
  { maxAge: 60, employeeRate: 0.17, employerRate: 0.155 },
  { maxAge: 65, employeeRate: 0.115, employerRate: 0.12 },
  { maxAge: 70, employeeRate: 0.075, employerRate: 0.09 },
  { maxAge: Infinity, employeeRate: 0.05, employerRate: 0.075 },
];

// Graduated PR rates for the 1st and 2nd year of PR status (age ≤55 per MOM;
// applied across ages here as a simplification — verify against current tables).
export const DEFAULT_PR_YEAR1 = { employeeRate: 0.05, employerRate: 0.04 };
export const DEFAULT_PR_YEAR2 = { employeeRate: 0.15, employerRate: 0.09 };

interface GraduatedRate {
  employeeRate: number;
  employerRate: number;
}

export interface CpfConfig {
  owCeilingCents: number;
  bands: AgeBand[];
  prYear1: GraduatedRate;
  prYear2: GraduatedRate;
}

export const DEFAULT_CPF_CONFIG: CpfConfig = {
  owCeilingCents: DEFAULT_OW_CEILING_CENTS,
  bands: DEFAULT_CPF_BANDS,
  prYear1: DEFAULT_PR_YEAR1,
  prYear2: DEFAULT_PR_YEAR2,
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
 * Which PR contribution year an employee is in on `onDateISO`, given the date
 * they obtained PR status. 1 and 2 are graduated; 3 means "3rd year onwards"
 * (full rates). Whole years elapsed + 1, clamped to [1, 3]. A missing/future
 * start date defaults to 3 (full rates — the conservative, non-under-paying
 * assumption for an already-established PR).
 */
export function prYearOn(
  prStartISO: string | undefined,
  onDateISO: string,
): 1 | 2 | 3 {
  if (!prStartISO) return 3;
  const elapsed = ageOn(prStartISO, onDateISO); // whole years since PR start
  if (elapsed <= 0) return 1;
  if (elapsed === 1) return 2;
  return 3;
}

/**
 * Compute CPF for a month.
 * @param ordinaryWageCents gross CPF-eligible monthly wage (base + cpfable allowances)
 * @param age employee age at the pay-period end
 * @param status residency status
 * @param prYear for PRs, the contribution year (1 | 2 | 3+); ignored otherwise
 */
export function computeCpf(
  ordinaryWageCents: number,
  age: number,
  status: CpfStatusValue,
  prYear: 1 | 2 | 3 = 3,
  config: CpfConfig = DEFAULT_CPF_CONFIG,
): CpfResult {
  const zero: CpfResult = {
    cpfableWageCents: 0,
    employeeCpfCents: 0,
    employerCpfCents: 0,
    employeeRate: 0,
    employerRate: 0,
  };
  // Foreigners / exempt do not contribute.
  if (status === "foreigner" || status === "exempt" || ordinaryWageCents <= 0) {
    return zero;
  }
  const cpfableWageCents = Math.min(ordinaryWageCents, config.owCeilingCents);
  // PR years 1 & 2 use flat graduated rates; everyone else uses full age bands.
  let employeeRate: number;
  let employerRate: number;
  if (status === "pr" && prYear === 1) {
    employeeRate = config.prYear1.employeeRate;
    employerRate = config.prYear1.employerRate;
  } else if (status === "pr" && prYear === 2) {
    employeeRate = config.prYear2.employeeRate;
    employerRate = config.prYear2.employerRate;
  } else {
    const band = bandForAge(age, config.bands);
    employeeRate = band.employeeRate;
    employerRate = band.employerRate;
  }
  return {
    cpfableWageCents,
    employeeCpfCents: Math.round(cpfableWageCents * employeeRate),
    employerCpfCents: Math.round(cpfableWageCents * employerRate),
    employeeRate,
    employerRate,
  };
}
