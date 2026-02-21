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

  let body: { user_id?: string; device_id?: string };
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

  if (!userId || !deviceId) {
    return new Response(
      JSON.stringify({ error: "user_id and device_id are required" }),
      { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  // Verify device belongs to user
  const { data: deviceData, error: deviceError } = await supabase
    .from("devices")
    .select("user_id")
    .eq("device_id", deviceId)
    .single();

  if (deviceError || !deviceData || deviceData.user_id !== userId) {
    return new Response(
      JSON.stringify({ error: "Device not found or does not belong to user" }),
      { status: 403, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  // Fetch all groups for this user via user-level group_members table
  const { data: rows, error } = await supabase
    .from("groups")
    .select("group_id, name, avatar_url, ds_url, group_members!inner(user_id)")
    .eq("group_members.user_id", userId)
    .order("group_id", { ascending: true });

  if (error) {
    console.error("[user_groups] select error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  const groups = (rows ?? []).map((g) => ({
    group_id: g.group_id,
    name: g.name,
    avatar_url: g.avatar_url ?? null,
    ds_url: g.ds_url,
  }));

  return new Response(
    JSON.stringify({ groups }),
    { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
  );
});
