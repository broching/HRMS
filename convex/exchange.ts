import { action } from "./_generated/server";
import { v } from "convex/values";

// Live currency conversion for the claim form's "auto" exchange mode. Uses the
// Frankfurter API (ECB reference rates, free, no key) which supports a specific
// historical date, so the rate can be locked to the claim's submit date.
//
// The submitter fetches the rate here and passes it (with its date) into
// `claims.submit`, where it is snapshotted onto the claim — reviewing the claim
// later always shows that same rate, never a fresh one.
export const getRate = action({
  args: {
    from: v.string(), // foreign currency (e.g. "USD")
    to: v.string(), // base/org currency (e.g. "SGD")
    date: v.optional(v.string()), // ISO date; defaults to today
  },
  returns: v.object({
    rate: v.number(), // base units per 1 foreign unit
    date: v.string(), // actual date the rate is for (may fall back to prior business day)
    provider: v.string(),
  }),
  handler: async (ctx, { from, to, date }) => {
    // Authenticated members only (actions can't touch the DB, so we just verify
    // an identity is present rather than resolving full org context).
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated.");
    const day = date ?? new Date().toISOString().slice(0, 10);
    if (from === to) return { rate: 1, date: day, provider: "same" };

    // Frankfurter (ECB) supports historical dates but only ECB currencies — it
    // has no MYR, VND, PHP, etc. Try it first, then fall back to ExchangeRate-API's
    // free "open" endpoint (latest rates, broad coverage incl. MYR) so those
    // currencies still get a live rate.
    const viaFrankfurter = await frankfurterRate(from, to, day);
    if (viaFrankfurter) return viaFrankfurter;

    const viaErApi = await erApiRate(from, to);
    if (viaErApi) return viaErApi;

    throw new Error(
      `No published rate for ${from}→${to}. Enter it manually instead.`,
    );
  },
});

// ECB reference rates for a specific date. Returns null when unreachable or the
// pair isn't covered (e.g. a non-ECB currency like MYR).
async function frankfurterRate(
  from: string,
  to: string,
  day: string,
): Promise<{ rate: number; date: string; provider: string } | null> {
  const url = `https://api.frankfurter.dev/v1/${day}?base=${encodeURIComponent(
    from,
  )}&symbols=${encodeURIComponent(to)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      date?: string;
      rates?: Record<string, number>;
    };
    const rate = data.rates?.[to];
    if (typeof rate !== "number") return null;
    return { rate, date: data.date ?? day, provider: "frankfurter" };
  } catch {
    return null;
  }
}

// ExchangeRate-API open endpoint: latest rates only, but broad currency coverage
// (MYR, VND, PHP, …). No key required. Returns null on any failure.
async function erApiRate(
  from: string,
  to: string,
): Promise<{ rate: number; date: string; provider: string } | null> {
  const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      result?: string;
      rates?: Record<string, number>;
    };
    const rate = data.rates?.[to];
    if (data.result !== "success" || typeof rate !== "number") return null;
    return {
      rate,
      date: new Date().toISOString().slice(0, 10),
      provider: "open.er-api",
    };
  } catch {
    return null;
  }
}
