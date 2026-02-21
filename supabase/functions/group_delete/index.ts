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

  let body: { group_id?: string; user_id?: string; device_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  const groupId = typeof body.group_id === "string" ? body.group_id.trim() : "";
  const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
  const deviceId = typeof body.device_id === "string" ? body.device_id.trim() : "";

  if (!groupId || !userId || !deviceId) {
    return new Response(
      JSON.stringify({ error: "group_id, user_id, and device_id are required" }),
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

  // Verify user is a member of the group
  const { data: isMember } = await supabase
    .rpc("is_group_member", { p_group_id: groupId, p_user_id: userId });

  if (!isMember) {
    return new Response(
      JSON.stringify({ error: "Not a group member" }),
      { status: 403, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  // Delete the group — CASCADE handles group_members, group_seq, and messages
  const { error: deleteError } = await supabase
    .from("groups")
    .delete()
    .eq("group_id", groupId);

  if (deleteError) {
    console.error("[group_delete] delete error:", deleteError);
    return new Response(
      JSON.stringify({ error: deleteError.message }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
  );
});
