import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyRegistrationResponse } from "https://esm.sh/@simplewebauthn/server@7.2.0";
import { corsHeaders, getWebAuthnOriginAndRpId, handleCorsPreflight } from "../../_shared/cors.ts";
import { bytesToBase64Url, challengeToBase64Url } from "../../_shared/webauthn.ts";

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
    console.error("[auth_register] WebAuthn config error:", msg);
    return new Response(JSON.stringify({ error: "Server configuration error" }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const requestOrigin = req.headers.get("origin");
  const hasExplicitOrigin = !!Deno.env.get("WEBAUTHN_ORIGIN")?.trim();
  if (!requestOrigin && !hasExplicitOrigin) {
    console.warn("[auth_register] Set WEBAUTHN_ORIGIN (e.g. https://app.minimum.chat) and WEBAUTHN_RP_ID (e.g. app.minimum.chat) in Supabase Edge Function secrets.");
  }

  const body = await req.json();
  const {
    challenge_id,
    user_id: name_input,
    device_id,
    mls_public_key,
    mls_private_key_enc,
    webauthn_create_response,
  } = body;

  if (!challenge_id) {
    return new Response(JSON.stringify({ error: "Missing challenge_id" }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const user_id =
    typeof name_input === "string" ? name_input.trim() : "";
  if (user_id.length === 0) {
    return new Response(JSON.stringify({ error: "Name is required" }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
  if (user_id.length > 64) {
    return new Response(JSON.stringify({ error: "Name must be at most 64 characters" }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const { data: existing } = await supabase
    .from("users")
    .select("user_id")
    .eq("user_id", user_id)
    .limit(1)
    .maybeSingle();

  if (existing) {
    return new Response(JSON.stringify({ error: "Name already taken" }), {
      status: 409,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  // Validate WebAuthn response shape before calling library (avoids "reading 'toString' of undefined" inside lib)
  const r = webauthn_create_response;
  if (!r || typeof r !== "object") {
    return new Response(JSON.stringify({ error: "Missing or invalid webauthn_create_response" }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
  const id = r.id;
  const rawId = r.rawId;
  const res = r.response;
  if (typeof id !== "string" || id.trim() === "") {
    return new Response(JSON.stringify({ error: "webauthn_create_response.id must be a non-empty string" }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
  if (!res || typeof res !== "object") {
    return new Response(JSON.stringify({ error: "webauthn_create_response.response is required" }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
  const clientDataJSON = res.clientDataJSON;
  const attestationObject = res.attestationObject;
  if (typeof clientDataJSON !== "string" || clientDataJSON.trim() === "") {
    return new Response(JSON.stringify({ error: "webauthn_create_response.response.clientDataJSON must be a non-empty string" }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
  if (typeof attestationObject !== "string" || attestationObject.trim() === "") {
    return new Response(JSON.stringify({ error: "webauthn_create_response.response.attestationObject must be a non-empty string" }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
  const normalizedResponse = {
    id,
    rawId: typeof rawId === "string" ? rawId : id,
    type: r.type === "public-key" ? "public-key" : "public-key",
    response: {
      clientDataJSON,
      attestationObject,
      transports: Array.isArray(r.response?.transports) ? r.response.transports : [],
    },
  };

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

  const challengeFromDb = challengeData.challenge;
  if (typeof challengeFromDb !== "string" || challengeFromDb.trim() === "") {
    console.error("[auth_register] Invalid challenge in DB: not a non-empty string");
    return new Response(JSON.stringify({ error: "Invalid challenge data" }), {
      status: 400,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const expectedChallenge = challengeToBase64Url(challengeFromDb);

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: normalizedResponse,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpId,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("[auth_register] WebAuthn validation failed:", msg, "expectedOrigin=" + origin, "expectedRPID=" + rpId, stack ?? "");
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
  const credIdStr = bytesToBase64Url(new Uint8Array(credId));
  const credPk = verification.registrationInfo!.credentialPublicKey;

  const { data: user, error: userError } = await supabase
    .from("users")
    .upsert({
      user_id,
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
        displayName: user_id,
        avatarUrl: null,
      },
    }),
    { status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" } }
  );
});