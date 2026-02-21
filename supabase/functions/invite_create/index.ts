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

  // Validate user is a group member
  const { data: memberCheck } = await supabase
    .rpc("is_group_member", { p_group_id: groupId, p_user_id: userId });

  if (!memberCheck) {
    return new Response(
      JSON.stringify({ error: "User is not a member of this group" }),
      { status: 403, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  // Fetch group name
  const { data: groupData, error: groupError } = await supabase
    .from("groups")
    .select("name")
    .eq("group_id", groupId)
    .single();

  if (groupError || !groupData) {
    return new Response(
      JSON.stringify({ error: "Group not found" }),
      { status: 404, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  // Create invite
  const { data: inviteData, error: inviteError } = await supabase
    .from("invites")
    .insert({
      group_id: groupId,
      group_name: groupData.name,
      inviter_id: userId,
      status: "pending",
    })
    .select("invite_id")
    .single();

  if (inviteError || !inviteData) {
    console.error("[invite_create] insert error:", inviteError);
    return new Response(
      JSON.stringify({ error: "Failed to create invite" }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ invite_id: inviteData.invite_id }),
    { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
  );
});
