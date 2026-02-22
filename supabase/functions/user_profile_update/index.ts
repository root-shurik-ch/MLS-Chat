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

  const body = await req.json();
  const { user_id, device_id, status_text, avatar_base64 } = body;

  if (!user_id || !device_id) {
    return new Response(JSON.stringify({ error: "Missing user_id or device_id" }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  // Validate device belongs to user
  const { data: device, error: deviceError } = await supabase
    .from("devices")
    .select("device_id")
    .eq("device_id", device_id)
    .eq("user_id", user_id)
    .maybeSingle();

  if (deviceError || !device) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  // Validate status_text length
  if (status_text !== undefined && status_text !== null) {
    if (typeof status_text !== "string" || status_text.length > 80) {
      return new Response(JSON.stringify({ error: "status_text must be at most 80 characters" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }
  }

  let avatarUrl: string | null = null;

  if (avatar_base64) {
    // Strip data URL prefix if present
    const base64Data = typeof avatar_base64 === "string"
      ? avatar_base64.replace(/^data:image\/\w+;base64,/, "")
      : avatar_base64;

    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Limit to 200 KB (client targets 80 KB; 200 KB gives headroom for base64 overhead)
    if (bytes.length > 200 * 1024) {
      return new Response(JSON.stringify({ error: "Avatar must be at most 200 KB" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(`${user_id}/avatar.jpg`, bytes, {
        contentType: "image/jpeg",
        upsert: true,
      });

    if (uploadError) {
      console.error("[user_profile_update] Upload error:", uploadError.message);
      return new Response(JSON.stringify({ error: "Failed to upload avatar" }), {
        status: 500,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { data: publicUrlData } = supabase.storage
      .from("avatars")
      .getPublicUrl(`${user_id}/avatar.jpg`);

    avatarUrl = publicUrlData.publicUrl;
  }

  // Build update payload with only the fields that were provided
  const updatePayload: Record<string, unknown> = {};
  if (avatarUrl !== null) updatePayload.avatar_url = avatarUrl;
  if (status_text !== undefined) updatePayload.status_text = status_text;

  if (Object.keys(updatePayload).length > 0) {
    const { error: updateError } = await supabase
      .from("users")
      .update(updatePayload)
      .eq("user_id", user_id);

    if (updateError) {
      console.error("[user_profile_update] Update error:", updateError.message);
      return new Response(JSON.stringify({ error: "Failed to update profile" }), {
        status: 500,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, avatar_url: avatarUrl }),
    { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
  );
});
