import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.json();
  const { action } = body;

  if (!["register", "login"].includes(action)) {
    return new Response(JSON.stringify({ error: "Invalid action" }), { status: 400 });
  }

  // Generate random challenge
  const challenge = btoa(crypto.getRandomValues(new Uint8Array(32)).buffer);

  return new Response(
    JSON.stringify({
      challenge,
      ttl: 300000,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});