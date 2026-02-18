import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuthenticationResponse } from "https://esm.sh/@simplewebauthn/server@7.2.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const rpId = Deno.env.get("WEBAUTHN_RP_ID") || "localhost";
const origin = Deno.env.get("WEBAUTHN_ORIGIN") || "http://localhost:3000";

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const body = await req.json();
  const { challenge_id, user_id, device_id, webauthn_get_response } = body;

  // Get challenge from db
  const { data: challengeData, error: challengeError } = await supabase
    .from("challenges")
    .select("challenge, action")
    .eq("challenge_id", challenge_id)
    .single();

  if (challengeError || !challengeData) {
    return new Response(JSON.stringify({ error: "Invalid challenge" }), { status: 400 });
  }

  if (challengeData.action !== "login") {
    return new Response(JSON.stringify({ error: "Challenge not for login" }), { status: 400 });
  }

  // Get user
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("*")
    .eq("user_id", user_id)
    .single();

  if (userError) {
    return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });
  }

  // Decode challenge
  const expectedChallenge = Uint8Array.from(atob(challengeData.challenge), c => c.charCodeAt(0));

  // Validate WebAuthn response
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: webauthn_get_response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpId,
      authenticator: {
        credentialPublicKey: new Uint8Array(JSON.parse(user.passkey_public_key)),
        credentialID: user.passkey_credential_id,
        counter: 0, // Assuming no counter
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "WebAuthn validation failed: " + error.message }), { status: 400 });
  }

  if (!verification.verified) {
    return new Response(JSON.stringify({ error: "WebAuthn verification failed" }), { status: 400 });
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

  // Delete used challenge
  await supabase.from("challenges").delete().eq("challenge_id", challenge_id);

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