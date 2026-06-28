/**
 * Signed, short-lived QR tokens for attendance clock-in.
 *
 * A token is `base64url(payload).base64url(hmacSHA256(payload, officeSecret))`
 * where the payload carries the office id and an expiry. Because it is signed
 * with a per-office secret that never leaves the server, a token cannot be
 * forged, and because it expires within ~minutes a screenshot can't be reused
 * later (combined with the GPS geofence this resists buddy-punching).
 *
 * Uses the Web Crypto API, which is available in the Convex default runtime —
 * no `"use node"` action required.
 */

export interface QrPayload {
  o: string; // office id
  e: number; // expiry, epoch ms
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(
  secret: string,
  usage: KeyUsage[],
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usage,
  );
}

/** Generate a fresh random office secret (used when QR is first enabled). */
export function newOfficeSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToB64url(bytes);
}

/** Sign a payload into a token string. */
export async function signQrToken(
  secret: string,
  payload: QrPayload,
): Promise<string> {
  const payloadB64 = bytesToB64url(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
  return `${payloadB64}.${bytesToB64url(new Uint8Array(sig))}`;
}

/**
 * Read the payload of a token WITHOUT verifying its signature. Use only to
 * discover which office a token claims to belong to (so its secret can be
 * loaded); always follow with `verifyQrToken` before trusting it.
 */
export function peekQrPayload(token: string): QrPayload | null {
  const [payloadB64] = token.split(".");
  if (!payloadB64) return null;
  try {
    const parsed = JSON.parse(dec.decode(b64urlToBytes(payloadB64)));
    if (typeof parsed?.o === "string" && typeof parsed?.e === "number") {
      return parsed as QrPayload;
    }
    return null;
  } catch {
    return null;
  }
}

/** Verify a token against a secret. Returns the payload, or null if invalid. */
export async function verifyQrToken(
  secret: string,
  token: string,
): Promise<QrPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  try {
    const key = await hmacKey(secret, ["verify"]);
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      b64urlToBytes(sigB64),
      enc.encode(payloadB64),
    );
    if (!ok) return null;
    return peekQrPayload(token);
  } catch {
    return null;
  }
}
