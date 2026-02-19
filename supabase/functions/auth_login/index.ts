import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuthenticationResponse } from "https://esm.sh/@simplewebauthn/server@7.2.0";
import { corsHeaders, getWebAuthnOriginAndRpId, handleCorsPreflight } from "../../_shared/cors.ts";
import { base64UrlToBytes, challengeToBase64Url } from "../../_shared/webauthn.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders(req) });
  }

  let origin: string;
  let rpId: string;
  try {
    const webAuthn = getWebAuthnOriginAndRpId(req);
    origin = webAuthn.origin;
    rpId = webAuthn.rpId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[auth_login] WebAuthn config error:", msg);
    return new Response(JSON.stringify({ error: "Server configuration error" }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const body = await req.json();
  const { challenge_id, user_id: name_input, device_id, webauthn_get_response } = body;

  const { data: challengeData, error: challengeError } = await supabase
    .from("challenges")
    .select("challenge, action")
    .eq("challenge_id", challenge_id)
    .single();

  if (challengeError || !challengeData) {
    return new Response(JSON.stringify({ error: "Invalid challenge" }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  if (challengeData.action !== "login") {
    return new Response(JSON.stringify({ error: "Challenge not for login" }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const user_id =
    typeof name_input === "string" ? name_input.trim() : "";
  if (!user_id) {
    return new Response(JSON.stringify({ error: "Name is required" }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("user_id, passkey_credential_id, passkey_public_key, avatar_url")
    .eq("user_id", user_id)
    .single();

  if (userError || !user) {
    return new Response(JSON.stringify({ error: "User not found" }), {
      status: 404,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const challengeFromDb = challengeData.challenge;
  if (typeof challengeFromDb !== "string" || challengeFromDb.trim() === "") {
    return new Response(JSON.stringify({ error: "Invalid challenge data" }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
  const expectedChallenge = challengeToBase64Url(challengeFromDb);

  if (typeof user.passkey_credential_id !== "string" || user.passkey_credential_id.trim() === "") {
    return new Response(JSON.stringify({ error: "Invalid credential data" }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
  const credIdBytes = base64UrlToBytes(user.passkey_credential_id);

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
        credentialID: credIdBytes,
        counter: 0,
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "WebAuthn validation failed: " + error.message }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  if (!verification.verified) {
    return new Response(JSON.stringify({ error: "WebAuthn verification failed" }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  // Get or create device (mls keys live in devices, not users)
  let { data: device } = await supabase
    .from("devices")
    .select("*")
    .eq("device_id", device_id)
    .single();

  if (!device) {
    const { data: anyDevice } = await supabase
      .from("devices")
      .select("mls_pk, mls_sk_enc")
      .eq("user_id", user_id)
      .limit(1)
      .single();
    if (!anyDevice) {
      return new Response(JSON.stringify({ error: "No device keys for user" }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const { error: insertError } = await supabase
      .from("devices")
      .insert({
        device_id,
        user_id,
        mls_pk: anyDevice.mls_pk,
        mls_sk_enc: anyDevice.mls_sk_enc,
      });
    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }
    device = { mls_pk: anyDevice.mls_pk, mls_sk_enc: anyDevice.mls_sk_enc };
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
        displayName: user.user_id,
        avatarUrl: user.avatar_url,
      },
    }),
    { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
  );
});
