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
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
  if (isAllowedOrigin(origin, allowed) && origin) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders(req) });
  }
  return null;
}
