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
  const { user_id, device_id } = body;

  // Get key package from devices
  const { data: device, error } = await supabase
    .from("devices")
    .select("mls_pk")
    .eq("user_id", user_id)
    .eq("device_id", device_id)
    .single();

  if (error || !device) {
    return new Response(JSON.stringify({ error: "Device not found" }), { status: 404 });
  }

  return new Response(
    JSON.stringify({
      key_package: device.mls_pk,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
