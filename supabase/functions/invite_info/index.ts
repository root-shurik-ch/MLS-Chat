import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCorsPreflight } from "../../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  let inviteId: string | null = null;

  if (req.method === "GET") {
    const url = new URL(req.url);
    inviteId = url.searchParams.get("invite_id");
  } else if (req.method === "POST") {
    try {
      const body = await req.json() as { invite_id?: string };
      inviteId = typeof body.invite_id === "string" ? body.invite_id.trim() : null;
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }
  } else {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders(req) });
  }

  if (!inviteId) {
    return new Response(
      JSON.stringify({ error: "invite_id is required" }),
      { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  const { data, error } = await supabase
    .from("invites")
    .select("group_name, status, expires_at")
    .eq("invite_id", inviteId)
    .single();

  if (error || !data) {
    return new Response(
      JSON.stringify({ error: "Invite not found" }),
      { status: 404, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  }

  const expired = data.expires_at ? new Date(data.expires_at) < new Date() : false;

  return new Response(
    JSON.stringify({ group_name: data.group_name, status: data.status, expired }),
    { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
  );
});
