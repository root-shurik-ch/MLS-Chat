import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCorsPreflight } from "../../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

function getDefaultDsUrl(): string {
  const u = new URL(supabaseUrl);
  const protocol = u.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${u.host}/functions/v1/ds_send`;
}

serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders(req) });
  }

  let body: { group_id?: string; name?: string; avatar_url?: string; user_id?: string; device_id?: string; ds_url?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const { group_id, name, avatar_url, user_id, device_id, ds_url: dsUrlInput } = body;
  const groupId = typeof group_id === "string" ? group_id.trim() : "";
  const groupName = typeof name === "string" ? name.trim() : "";
  const userId = typeof user_id === "string" ? user_id.trim() : "";
  const deviceId = typeof device_id === "string" ? device_id.trim() : "";

  if (!groupId || !groupName || !userId || !deviceId) {
    return new Response(
      JSON.stringify({ error: "group_id, name, user_id, and device_id are required" }),
      { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  const { data: userData, error: userError } = await supabase
    .from("users")
    .select("user_id")
    .eq("user_id", userId)
    .single();

  if (userError || !userData) {
    return new Response(JSON.stringify({ error: "User not found" }), {
      status: 404,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const { data: deviceData, error: deviceError } = await supabase
    .from("devices")
    .select("user_id")
    .eq("device_id", deviceId)
    .single();

  if (deviceError || !deviceData || deviceData.user_id !== userId) {
    return new Response(JSON.stringify({ error: "Device not found or does not belong to user" }), {
      status: 404,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const dsUrl = typeof dsUrlInput === "string" && dsUrlInput.trim() ? dsUrlInput.trim() : getDefaultDsUrl();

  const { error: groupInsertError } = await supabase.from("groups").insert({
    group_id: groupId,
    name: groupName,
    avatar_url: typeof avatar_url === "string" && avatar_url.trim() ? avatar_url.trim() : null,
    ds_url: dsUrl,
  });

  if (groupInsertError) {
    if (groupInsertError.code === "23505") {
      return new Response(JSON.stringify({ error: "Group already exists" }), {
        status: 409,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }
    console.error("[group_create] groups insert error:", groupInsertError);
    return new Response(JSON.stringify({ error: groupInsertError.message }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const { error: memberError } = await supabase.from("group_members").insert({
    group_id: groupId,
    device_id: deviceId,
    role: "member",
  });

  if (memberError) {
    console.error("[group_create] group_members insert error:", memberError);
    const { error: delErr } = await supabase.from("groups").delete().eq("group_id", groupId);
    if (delErr) console.error("[group_create] rollback: groups delete failed:", delErr);
    return new Response(JSON.stringify({ error: memberError.message }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const { error: seqError } = await supabase.from("group_seq").insert({
    group_id: groupId,
    last_server_seq: 0,
  });

  if (seqError) {
    console.error("[group_create] group_seq insert error:", seqError);
    const { error: delMembersErr } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", groupId);
    if (delMembersErr) console.error("[group_create] rollback: group_members delete failed:", delMembersErr);
    const { error: delGroupsErr } = await supabase.from("groups").delete().eq("group_id", groupId);
    if (delGroupsErr) console.error("[group_create] rollback: groups delete failed:", delGroupsErr);
    return new Response(JSON.stringify({ error: seqError.message }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ group_id: groupId, name: groupName }),
    { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
  );
});
