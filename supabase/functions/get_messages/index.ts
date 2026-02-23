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

  let body: { group_id?: string; user_id?: string; device_id?: string; since_seq?: number; limit?: number };
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
  const sinceSeq = typeof body.since_seq === "number" ? body.since_seq : 0;
  const limit = typeof body.limit === "number" && body.limit > 0 ? Math.min(body.limit, 1000) : 200;

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
      JSON.stringify({ error: "Invalid device or user" }),
      { status: 403, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  // Check user-level membership via is_group_member() helper
  const { data: isMember } = await supabase
    .rpc("is_group_member", { p_group_id: groupId, p_user_id: userId });

  if (!isMember) {
    return new Response(
      JSON.stringify({ error: "Not a group member" }),
      { status: 403, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  let msgsQuery = supabase
    .from("messages")
    .select("server_seq, server_time, sender_id, device_id, msg_kind, mls_bytes")
    .eq("group_id", groupId)
    .order("server_seq", { ascending: true })
    .limit(limit);
  if (sinceSeq > 0) msgsQuery = msgsQuery.gt("server_seq", sinceSeq);
  const { data: rows, error } = await msgsQuery;

  if (error) {
    console.error("[get_messages] select error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  const messages = (rows ?? []).map((r) => ({
    server_seq: r.server_seq,
    server_time: typeof r.server_time === "number" ? r.server_time : Number(r.server_time),
    sender_id: r.sender_id,
    device_id: r.device_id,
    msg_kind: r.msg_kind,
    mls_bytes: r.mls_bytes,
  }));

  return new Response(
    JSON.stringify({ messages }),
    { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
  );
});
