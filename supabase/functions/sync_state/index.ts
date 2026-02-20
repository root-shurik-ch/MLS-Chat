// sync_state — store and retrieve encrypted WASM state for cross-device sync.
//
// POST { user_id, device_id, wasm_state_enc }
//   → verifies device belongs to user, updates users.wasm_state_enc
//   → responds { success: true }
//
// GET/POST { user_id, device_id, action: "get" }
//   → verifies device belongs to user, returns { wasm_state_enc }
//
// Authentication: verified by checking device_id ∈ devices for user_id.
// The state blob is opaque to the server — it is AES-256-GCM encrypted
// client-side with a key derived from the passkey PRF output.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCorsPreflight } from "../../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders(req) });
  }

  const body = await req.json();
  const { user_id, device_id, action, wasm_state_enc } = body;

  if (!user_id || !device_id) {
    return new Response(JSON.stringify({ error: "user_id and device_id required" }), {
      status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  // Verify the device belongs to this user
  const { data: device, error: deviceError } = await supabase
    .from("devices")
    .select("device_id")
    .eq("device_id", device_id)
    .eq("user_id", user_id)
    .single();

  if (deviceError || !device) {
    return new Response(JSON.stringify({ error: "Invalid user or device" }), {
      status: 403, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  if (action === "get") {
    // Return current encrypted WASM state
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("wasm_state_enc")
      .eq("user_id", user_id)
      .single();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ wasm_state_enc: user.wasm_state_enc ?? null }),
      { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  // Default action: save encrypted WASM state
  if (typeof wasm_state_enc !== "string" || wasm_state_enc.length === 0) {
    return new Response(JSON.stringify({ error: "wasm_state_enc required" }), {
      status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const { error: updateError } = await supabase
    .from("users")
    .update({ wasm_state_enc })
    .eq("user_id", user_id);

  if (updateError) {
    return new Response(JSON.stringify({ error: updateError.message }), {
      status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
  );
});
