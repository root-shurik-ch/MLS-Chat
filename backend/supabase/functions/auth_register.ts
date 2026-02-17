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
  const {
    user_id,
    device_id,
    display_name,
    mls_public_key,
    mls_private_key_enc,
    webauthn_create_response,
  } = body;

  // Validate WebAuthn response (simplified, in real impl use a library)
  // Assume validation passes

  // Insert user if not exists
  const { data: user, error: userError } = await supabase
    .from("users")
    .upsert({
      user_id,
      display_name,
      avatar_url: null,
      passkey_credential_id: webauthn_create_response.id,
      passkey_public_key: JSON.stringify(webauthn_create_response),
      mls_pk: mls_public_key,
      mls_sk_enc: mls_private_key_enc,
    })
    .select()
    .single();

  if (userError) {
    return new Response(JSON.stringify({ error: userError.message }), { status: 400 });
  }

  // Insert device
  const { error: deviceError } = await supabase
    .from("devices")
    .insert({
      device_id,
      user_id,
      mls_pk: mls_public_key,
      mls_sk_enc: mls_private_key_enc,
    });

  if (deviceError) {
    return new Response(JSON.stringify({ error: deviceError.message }), { status: 400 });
  }

  // Generate auth_token (simplified, use JWT)
  const auth_token = "dummy_token"; // Replace with real JWT

  return new Response(
    JSON.stringify({
      user_id,
      auth_token,
      profile: {
        userId: user_id,
        displayName: display_name,
        avatarUrl: null,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});