import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyRegistrationResponse } from "https://esm.sh/@simplewebauthn/server@7.2.0";
import { corsHeaders, handleCorsPreflight } from "../../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const rpId = Deno.env.get("WEBAUTHN_RP_ID") || "localhost";
const origin = Deno.env.get("WEBAUTHN_ORIGIN") || "http://localhost:3000";

serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders(req) });
  }

  const body = await req.json();
  const {
    challenge_id,
    user_id,
    device_id,
    display_name,
    mls_public_key,
    mls_private_key_enc,
    webauthn_create_response,
  } = body;

  // Get challenge from db
  const { data: challengeData, error: challengeError } = await supabase
    .from("challenges")
    .select("challenge, action")
    .eq("challenge_id", challenge_id)
    .single();

  if (challengeError || !challengeData) {
    console.error("[auth_register] Invalid challenge:", challengeError?.message ?? "no data");
    return new Response(JSON.stringify({ error: "Invalid challenge" }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  if (challengeData.action !== "register") {
    console.error("[auth_register] Challenge action mismatch:", challengeData.action);
    return new Response(JSON.stringify({ error: "Challenge not for register" }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  // Decode challenge
  const expectedChallenge = Uint8Array.from(atob(challengeData.challenge), c => c.charCodeAt(0));

  // Validate WebAuthn response
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: webauthn_create_response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpId,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[auth_register] WebAuthn validation failed:", msg, "expectedOrigin=" + origin, "expectedRPID=" + rpId);
    return new Response(JSON.stringify({ error: "WebAuthn validation failed: " + msg }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  if (!verification.verified) {
    console.error("[auth_register] WebAuthn verification.verified=false");
    return new Response(JSON.stringify({ error: "WebAuthn verification failed" }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const credId = verification.registrationInfo!.credentialID;
  const credIdStr = typeof credId === "string" ? credId : btoa(String.fromCharCode(...new Uint8Array(credId)));
  const credPk = verification.registrationInfo!.credentialPublicKey;

  // Insert user (users table: user_id, display_name, avatar_url, passkey_credential_id, passkey_public_key)
  const { data: user, error: userError } = await supabase
    .from("users")
    .upsert({
      user_id,
      display_name,
      avatar_url: null,
      passkey_credential_id: credIdStr,
      passkey_public_key: JSON.stringify(credPk),
    })
    .select()
    .single();

  if (userError) {
    console.error("[auth_register] users upsert error:", userError.message);
    return new Response(JSON.stringify({ error: userError.message }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
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
    console.error("[auth_register] devices insert error:", deviceError.message);
    return new Response(JSON.stringify({ error: deviceError.message }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  // Delete used challenge
  await supabase.from("challenges").delete().eq("challenge_id", challenge_id);

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
    { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
  );
});
