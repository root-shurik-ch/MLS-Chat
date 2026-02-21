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

  let body: { invite_id?: string; user_id?: string; device_id?: string; kp_hex?: string };
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
  const kpHex = typeof body.kp_hex === "string" ? body.kp_hex.trim() : "";

  if (!inviteId || !userId || !deviceId || !kpHex) {
    return new Response(
      JSON.stringify({ error: "invite_id, user_id, device_id, and kp_hex are required" }),
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
    .select("status, expires_at")
    .eq("invite_id", inviteId)
    .single();

  if (inviteError || !invite) {
    return new Response(
      JSON.stringify({ error: "Invite not found" }),
      { status: 404, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return new Response(
      JSON.stringify({ error: "Invite has expired" }),
      { status: 410, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  if (invite.status !== "pending") {
    return new Response(
      JSON.stringify({ error: "Invite is no longer available" }),
      { status: 409, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  // Update invite with joiner's KP
  const { error: updateError } = await supabase
    .from("invites")
    .update({ status: "kp_submitted", joiner_id: userId, kp_hex: kpHex })
    .eq("invite_id", inviteId);

  if (updateError) {
    console.error("[invite_join] update error:", updateError);
    return new Response(
      JSON.stringify({ error: "Failed to submit key package" }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({ ok: true }),
    { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
  );
});
