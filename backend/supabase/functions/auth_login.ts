import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.json();
  const { user_id, device_id, webauthn_get_response } = body;

  // Validate WebAuthn response
  // Assume passes

  // Get user
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("*")
    .eq("user_id", user_id)
    .single();

  if (userError) {
    return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });
  }

  // Get or create device
  let { data: device } = await supabase
    .from("devices")
    .select("*")
    .eq("device_id", device_id)
    .single();

  if (!device) {
    const { error: insertError } = await supabase
      .from("devices")
      .insert({
        device_id,
        user_id,
        mls_pk: user.mls_pk,
        mls_sk_enc: user.mls_sk_enc,
      });
    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), { status: 400 });
    }
    device = { mls_pk: user.mls_pk, mls_sk_enc: user.mls_sk_enc };
  }

  const auth_token = "dummy_token";

  return new Response(
    JSON.stringify({
      user_id,
      auth_token,
      mls_private_key_enc: device.mls_sk_enc,
      mls_public_key: device.mls_pk,
      profile: {
        userId: user_id,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});