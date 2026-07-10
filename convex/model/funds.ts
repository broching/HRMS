/**
 * Statutory + custom fund contribution math (SHG, SDL, custom). No Convex
 * imports — pure and unit-testable. All amounts in integer cents.
 */

export interface FundBand {
  maxWageCents: number;
  amountCents: number;
}

/**
 * SHG (CDAC / SINDA / MBMF / ECF) employee contribution: the amount for the
 * first band whose ceiling covers the wage. Returns 0 for non-positive wages.
 */
export function shgContributionCents(
  wageCents: number,
  bands: FundBand[],
): number {
  if (wageCents <= 0 || bands.length === 0) return 0;
  const sorted = [...bands].sort((a, b) => a.maxWageCents - b.maxWageCents);
  for (const band of sorted) {
    if (wageCents <= band.maxWageCents) return band.amountCents;
  }
  return sorted[sorted.length - 1].amountCents;
}

export interface SdlConfig {
  rate: number;
  minCents: number;
  maxCents: number;
  active: boolean;
}

/**
 * SDL (Skills Development Levy) employer contribution = rate × gross, clamped
 * to [minCents, maxCents]. Returns 0 when inactive or gross is non-positive.
 */
export function sdlContributionCents(
  grossCents: number,
  cfg: SdlConfig,
): number {
  if (!cfg.active || grossCents <= 0) return 0;
  const raw = Math.round(grossCents * cfg.rate);
  return Math.min(cfg.maxCents, Math.max(cfg.minCents, raw));
}

export interface CustomFund {
  name: string;
  kind: "deduction" | "employer";
  calc: "flat" | "percent";
  amountCents?: number;
  percent?: number;
  capCents?: number;
}

/** A custom fund's contribution for a given gross, optionally capped. */
export function customFundCents(item: CustomFund, grossCents: number): number {
  let cents =
    item.calc === "flat"
      ? (item.amountCents ?? 0)
      : Math.round(grossCents * ((item.percent ?? 0) / 100));
  if (item.capCents != null) cents = Math.min(cents, item.capCents);
  return Math.max(0, cents);
}
