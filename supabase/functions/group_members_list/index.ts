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
      { status: 403, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  // Validate caller is a group member
  const { data: isMember, error: memberError } = await supabase
    .rpc("is_group_member", { p_group_id: groupId, p_user_id: userId });

  if (memberError || !isMember) {
    return new Response(
      JSON.stringify({ error: "Not a group member" }),
      { status: 403, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  // Fetch group members joined with user info
  const { data: members, error: membersError } = await supabase
    .from("group_members")
    .select("user_id, users!inner(display_name, avatar_url, last_seen)")
    .eq("group_id", groupId);

  if (membersError) {
    console.error("[group_members_list] members query error:", membersError);
    return new Response(
      JSON.stringify({ error: "Failed to fetch group members" }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  const now = Date.now();
  const onlineThresholdMs = 2 * 60 * 1000; // 2 minutes

  const memberList = (members ?? []).map((row: any) => {
    const user = row.users;
    const lastSeenRaw = user?.last_seen ?? null;
    const lastSeenMs = lastSeenRaw ? new Date(lastSeenRaw).getTime() : null;
    const isOnline = lastSeenMs !== null && (now - lastSeenMs) < onlineThresholdMs;
    return {
      user_id: row.user_id,
      display_name: user?.display_name ?? null,
      avatar_url: user?.avatar_url ?? null,
      is_online: isOnline,
      last_seen: lastSeenRaw,
    };
  });

  // Fetch pending invites for this group
  const { data: pendingInvites, error: invitesError } = await supabase
    .from("invites")
    .select("invite_id, status, created_at")
    .eq("group_id", groupId)
    .in("status", ["pending", "kp_submitted"])
    .gt("expires_at", new Date().toISOString());

  if (invitesError) {
    console.error("[group_members_list] invites query error:", invitesError);
    return new Response(
      JSON.stringify({ error: "Failed to fetch pending invites" }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      members: memberList,
      pending: pendingInvites ?? [],
    }),
    { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
  );
});
