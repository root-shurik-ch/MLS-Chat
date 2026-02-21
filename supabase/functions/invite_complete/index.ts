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

  let body: { invite_id?: string; user_id?: string; device_id?: string; welcome_hex?: string };
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
  const welcomeHex = typeof body.welcome_hex === "string" ? body.welcome_hex.trim() : "";

  if (!inviteId || !userId || !deviceId || !welcomeHex) {
    return new Response(
      JSON.stringify({ error: "invite_id, user_id, device_id, and welcome_hex are required" }),
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

  // Fetch invite
  const { data: invite, error: inviteError } = await supabase
    .from("invites")
    .select("inviter_id, status")
    .eq("invite_id", inviteId)
    .single();

  if (inviteError || !invite) {
    return new Response(
      JSON.stringify({ error: "Invite not found" }),
      { status: 404, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  if (invite.inviter_id !== userId) {
    return new Response(
      JSON.stringify({ error: "Only the inviter can complete this invite" }),
      { status: 403, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  if (invite.status !== "kp_submitted") {
    return new Response(
      JSON.stringify({ error: "Invite is not in kp_submitted state" }),
      { status: 409, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  // Update invite with welcome
  const { error: updateError } = await supabase
    .from("invites")
    .update({ status: "complete", welcome_hex: welcomeHex })
    .eq("invite_id", inviteId);

  if (updateError) {
    console.error("[invite_complete] update error:", updateError);
    return new Response(
      JSON.stringify({ error: "Failed to complete invite" }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ ok: true }),
    { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
  );
});
