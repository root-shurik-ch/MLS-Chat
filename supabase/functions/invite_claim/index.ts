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

  let body: { invite_id?: string; user_id?: string; device_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  const inviteId = typeof body.invite_id === "string" ? body.invite_id.trim() : "";
  const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
  const deviceId = typeof body.device_id === "string" ? body.device_id.trim() : "";

  if (!inviteId || !userId || !deviceId) {
    return new Response(
      JSON.stringify({ error: "invite_id, user_id, and device_id are required" }),
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

  // Fetch invite to get group_id for membership check
  const { data: invite, error: inviteError } = await supabase
    .from("invites")
    .select("group_id")
    .eq("invite_id", inviteId)
    .single();

  if (inviteError || !invite) {
    return new Response(
      JSON.stringify({ error: "Invite not found" }),
      { status: 404, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  // Verify caller is a group member
  const { data: isMember, error: memberError } = await supabase
    .rpc("is_group_member", { p_group_id: invite.group_id, p_user_id: userId });

  if (memberError || !isMember) {
    return new Response(
      JSON.stringify({ error: "Not a group member" }),
      { status: 403, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  // Atomic claim — returns true if this caller won the race
  const { data: claimed, error: claimError } = await supabase
    .rpc("claim_invite", { p_invite_id: inviteId, p_user_id: userId });

  if (claimError) {
    console.error("[invite_claim] claim error:", claimError);
    return new Response(
      JSON.stringify({ error: "Failed to claim invite" }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ claimed: claimed ?? false }),
    { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
  );
});
