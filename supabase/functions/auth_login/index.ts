import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAuthenticationResponse } from "https://esm.sh/@simplewebauthn/server@13";
import { corsHeaders, getWebAuthnOriginAndRpId, handleCorsPreflight } from "../../_shared/cors.ts";
import { challengeToBase64Url } from "../../_shared/webauthn.ts";

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

  // Select user data (mls_pk lives on the devices table, fetched separately below)
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("user_id, passkey_credential_id, passkey_public_key, avatar_url, wasm_state_enc")
    .eq("user_id", user_id)
    .single();

  if (userError) {
    // PGRST116 = no rows returned (.single() found nothing) → genuine 404
    // Any other error (e.g. unknown column, connection failure) → 500
    const isNotFound = userError.code === "PGRST116";
    return new Response(
      JSON.stringify({ error: isNotFound ? "User not found" : "Database error" }),
      {
        status: isNotFound ? 404 : 500,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      }
    );
  }
  if (!user) {
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

  // v13 API: credential (id, publicKey, counter), not authenticator
  const publicKeyBytes = new Uint8Array(JSON.parse(user.passkey_public_key));
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: webauthn_get_response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpId,
      credential: {
        id: user.passkey_credential_id,
        publicKey: publicKeyBytes,
        counter: 0,
        transports: [],
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: "WebAuthn validation failed: " + msg }), {
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

  // Ensure device record exists. Fetch existing device to get mls_pk.
  // No mls_sk_enc is stored or returned — private key is derived client-side from PRF via HKDF.
  let deviceMlsPk: string | null = null;
  const { data: existingDevice } = await supabase
    .from("devices")
    .select("device_id, mls_pk")
    .eq("device_id", device_id)
    .maybeSingle();

  if (!existingDevice) {
    // New device for existing user — copy mls_pk from any existing device
    const { data: anyDevice } = await supabase
      .from("devices")
      .select("mls_pk")
      .eq("user_id", user_id)
      .limit(1)
      .maybeSingle();

    deviceMlsPk = anyDevice?.mls_pk ?? null;

    const { error: insertError } = await supabase
      .from("devices")
      .insert({
        device_id,
        user_id,
        mls_pk: deviceMlsPk,
      });
    if (insertError) {
      console.error("[auth_login] devices insert error:", insertError.message);
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 400,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }
  } else {
    deviceMlsPk = existingDevice.mls_pk ?? null;
  }

  // Delete used challenge
  await supabase.from("challenges").delete().eq("challenge_id", challenge_id);

  const auth_token = "dummy_token";

  // Return mls_public_key so the client can use it for KeyPackage operations.
  // mls_private_key_enc is NOT returned — the client derives the private key
  // deterministically from the passkey PRF output via HKDF, without any server round-trip.
  return new Response(
    JSON.stringify({
      user_id,
      auth_token,
      mls_public_key: deviceMlsPk,
      wasm_state_enc: user.wasm_state_enc ?? null,
      profile: {
        userId: user_id,
        displayName: user.user_id,
        avatarUrl: user.avatar_url,
      },
    }),
    { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
  );
});
