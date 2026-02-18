/**
 * CORS: allowed origins come from env CORS_ALLOWED_ORIGINS (comma-separated).
 * Default: localhost only, so production domains must be set in Supabase (Vault / secrets).
 * Example: CORS_ALLOWED_ORIGINS=https://example.com,https://www.example.com
 */
const DEFAULT_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
];

function getAllowedOrigins(): string[] {
  const raw = Deno.env.get("CORS_ALLOWED_ORIGINS");
  if (!raw || raw.trim() === "") return DEFAULT_ORIGINS;
  return [
    ...DEFAULT_ORIGINS,
    ...raw.split(",").map((o) => o.trim()).filter(Boolean),
  ];
}

function getOrigin(req: Request): string | null {
  return req.headers.get("origin");
}

function isAllowedOrigin(origin: string | null, allowed: string[]): boolean {
  if (!origin) return false;
  return allowed.includes(origin);
}

export function corsHeaders(req: Request): Record<string, string> {
  const allowed = getAllowedOrigins();
  const origin = getOrigin(req);
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin, allowed) ? origin! : allowed[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders(req) });
  }
  return null;
}

/**
 * Returns expectedOrigin and rpId for WebAuthn verification.
 * If WEBAUTHN_ORIGIN is set, uses it (and WEBAUTHN_RP_ID or derived hostname).
 * Otherwise uses request Origin if it is in CORS_ALLOWED_ORIGINS.
 * Production: set WEBAUTHN_ORIGIN in Supabase secrets (e.g. https://app.minimum.chat);
 * the Origin header may not reach Edge Functions, so fallback would use localhost and break WebAuthn.
 */
export function getWebAuthnOriginAndRpId(req: Request): { origin: string; rpId: string } {
  const explicitOrigin = Deno.env.get("WEBAUTHN_ORIGIN")?.trim();
  const explicitRpId = Deno.env.get("WEBAUTHN_RP_ID")?.trim();
  if (explicitOrigin) {
    return {
      origin: explicitOrigin,
      rpId: explicitRpId || new URL(explicitOrigin).hostname,
    };
  }
  const requestOrigin = req.headers.get("origin");
  const allowed = getAllowedOrigins();
  if (requestOrigin && allowed.includes(requestOrigin)) {
    try {
      const rpId = new URL(requestOrigin).hostname;
      return { origin: requestOrigin, rpId };
    } catch {
      // fallback below
    }
  }
  return { origin: "http://localhost:3000", rpId: "localhost" };
}