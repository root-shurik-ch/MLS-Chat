import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
  const challengeBytes = crypto.getRandomValues(new Uint8Array(32));
  const challenge = btoa(String.fromCharCode(...challengeBytes));
  const challengeId = crypto.randomUUID();

  // Store challenge
  const { error } = await supabase
    .from("challenges")
    .insert({
      challenge_id: challengeId,
      challenge,
      action,
      ttl: 300000,
    });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(
    JSON.stringify({
      challenge_id: challengeId,
      challenge,
      ttl: 300000,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
