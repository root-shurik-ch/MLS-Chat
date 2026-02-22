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
    invite_id?: string;
    user_id?: string;
    device_id?: string;
    welcome_hex?: string;
    commit_hex?: string;
  };
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
  const commitHex = typeof body.commit_hex === "string" && body.commit_hex.trim() !== ""
    ? body.commit_hex.trim()
    : null;

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
    .select("group_id, status")
    .eq("invite_id", inviteId)
    .single();

  if (inviteError || !invite) {
    return new Response(
      JSON.stringify({ error: "Invite not found" }),
      { status: 404, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  // Any group member can complete the invite (replaces inviter_id check)
  const { data: isMember, error: memberError } = await supabase
    .rpc("is_group_member", { p_group_id: invite.group_id, p_user_id: userId });

  if (memberError || !isMember) {
    return new Response(
      JSON.stringify({ error: "Only group members can complete this invite" }),
      { status: 403, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  if (invite.status !== "kp_submitted") {
    return new Response(
      JSON.stringify({ error: "Invite is not in kp_submitted state" }),
      { status: 409, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  // Update invite with welcome (and commit if provided)
  const updatePayload: Record<string, unknown> = { status: "complete", welcome_hex: welcomeHex };
  if (commitHex) updatePayload.commit_hex = commitHex;

  const { error: updateError } = await supabase
    .from("invites")
    .update(updatePayload)
    .eq("invite_id", inviteId);

  if (updateError) {
    console.error("[invite_complete] update error:", updateError);
    return new Response(
      JSON.stringify({ error: "Failed to complete invite" }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  // Distribute commit to existing group members so they can advance their epoch.
  // - DB insert (send_message) is the reliable path for offline members (caught up via get_messages)
  // - Realtime broadcast delivers to currently-connected members immediately (best-effort)
  // - joiner is NOT yet in group_members at this point (group_join is client-side)
  // - processor's WS connection filters out its own sender_id, so no double-apply
  if (commitHex) {
    try {
      const { data: msgResult, error: msgError } = await supabase.rpc("send_message", {
        p_group_id: invite.group_id,
        p_sender_id: userId,
        p_device_id: deviceId,
        p_msg_kind: "commit",
        p_mls_bytes: commitHex,
      });

      if (msgError) {
        console.error("[invite_complete] send_message error:", msgError);
      } else if (msgResult?.[0]) {
        const { server_seq, server_time } = msgResult[0];

        // Best-effort Realtime broadcast — fire and don't block the response
        const channel = supabase.realtime.channel(`group-${invite.group_id}`);
        channel.subscribe((status: string) => {
          if (status === "SUBSCRIBED") {
            channel.send({
              type: "broadcast",
              event: "message",
              payload: {
                type: "deliver",
                group_id: invite.group_id,
                server_seq,
                server_time,
                sender_id: userId,
                device_id: deviceId,
                msg_kind: "commit",
                mls_bytes: commitHex,
              },
            }).finally(() => channel.unsubscribe());
          }
        });
      }
    } catch (e) {
      // Non-fatal: commit is in DB, offline members will catch up on reconnect
      console.error("[invite_complete] commit distribution error:", e);
    }
  }

  return new Response(
    JSON.stringify({ ok: true }),
    { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
  );
});
