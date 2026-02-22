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

  let body: {
    user_id?: string;
    device_id?: string;
    subscription?: { endpoint?: string; p256dh?: string; auth?: string };
  };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
  const deviceId = typeof body.device_id === "string" ? body.device_id.trim() : "";
  const endpoint = typeof body.subscription?.endpoint === "string" ? body.subscription.endpoint.trim() : "";
  const p256dh = typeof body.subscription?.p256dh === "string" ? body.subscription.p256dh.trim() : "";
  const auth = typeof body.subscription?.auth === "string" ? body.subscription.auth.trim() : "";

  if (!userId || !deviceId || !endpoint || !p256dh || !auth) {
    return new Response(
      JSON.stringify({ error: "user_id, device_id, and subscription (endpoint, p256dh, auth) are required" }),
      { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  // Validate device belongs to user
  const { data: deviceData, error: deviceError } = await supabase
    .from("devices")
    .select("user_id")
    .eq("device_id", deviceId)
    .single();

  if (deviceError || !deviceData || deviceData.user_id !== userId) {
    return new Response(
      JSON.stringify({ error: "Device not found or does not belong to user" }),
      { status: 404, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  // Upsert push subscription (one per device)
  const { error: upsertError } = await supabase
    .from("push_subscriptions")
    .upsert(
      { user_id: userId, device_id: deviceId, endpoint, p256dh, auth },
      { onConflict: "device_id" },
    );

  if (upsertError) {
    console.error("[push_register] upsert error:", upsertError);
    return new Response(
      JSON.stringify({ error: "Failed to register push subscription" }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ ok: true }),
    { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
  );
});
