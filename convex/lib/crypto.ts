/**
 * AES-256-GCM field encryption for sensitive identifiers (full NRIC/FIN),
 * using Web Crypto (`crypto.subtle`, available in the Convex runtime).
 *
 * The key is a base64-encoded 32-byte value in the `ID_ENC_KEY` env var.
 * Ciphertext is stored as base64(iv[12] || ciphertext+tag). Decrypt ONLY inside
 * permission-gated statutory functions (IR8A/AIS) — never return plaintext from
 * a read query. Losing `ID_ENC_KEY` makes stored identifiers unrecoverable.
 */

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function getKey(): Promise<CryptoKey> {
  const raw = process.env.ID_ENC_KEY;
  if (!raw) {
    throw new Error(
      "ID_ENC_KEY is not set; cannot encrypt/decrypt identifiers. Set a base64 32-byte key via `npx convex env set ID_ENC_KEY`.",
    );
  }
  const keyBytes = base64ToBytes(raw);
  if (keyBytes.length !== 32) {
    throw new Error("ID_ENC_KEY must be a base64-encoded 32-byte key.");
  }
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Encrypt a plaintext identifier → base64(iv || ciphertext+tag). */
export async function encryptId(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return bytesToBase64(out);
}

/** Decrypt a payload produced by {@link encryptId} back to plaintext. */
export async function decryptId(payload: string): Promise<string> {
  const key = await getKey();
  const bytes = base64ToBytes(payload);
  const iv = bytes.slice(0, 12);
  const ct = bytes.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}
