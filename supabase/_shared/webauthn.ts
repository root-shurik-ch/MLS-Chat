/**
 * WebAuthn helpers: base64url is the single format for challenge and credential ID in DB and API.
 */

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(base64url: string): Uint8Array {
  const b64 = base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(base64url.length + (4 - (base64url.length % 4)) % 4, "=");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Normalize challenge from DB to base64url (library and clientDataJSON use base64url). Handles legacy base64. */
export function challengeToBase64Url(challengeFromDb: string): string {
  if (challengeFromDb.includes("+") || challengeFromDb.includes("/")) {
    const b64 = challengeFromDb.padEnd(challengeFromDb.length + (4 - (challengeFromDb.length % 4)) % 4, "=");
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytesToBase64Url(bytes);
  }
  return challengeFromDb;
}
