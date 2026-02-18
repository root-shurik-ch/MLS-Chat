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
  const { user_id, device_id } = body;

  const { data: device, error } = await supabase
    .from("devices")
    .select("mls_pk")
    .eq("user_id", user_id)
    .eq("device_id", device_id)
    .single();

  if (error || !device) {
    return new Response(JSON.stringify({ error: "Device not found" }), {
      status: 404,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      key_package: device.mls_pk,
    }),
    { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
  );
});
