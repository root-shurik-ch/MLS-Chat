// message_cache_sync — store and retrieve encrypted message plaintext for cross-device history.
//
// POST { action:"upsert", group_id, server_seq, plaintext_enc, user_id, device_id }
//   → validates group membership, upserts row into message_cache
//   → responds { success: true }
//
// POST { action:"fetch", group_id, user_id, device_id, since_seq? }
//   → validates group membership, returns [{ server_seq, plaintext_enc }]
//
// The plaintext_enc blob is AES-256-GCM ciphertext encrypted client-side with kMsgCache
// (HKDF("mls-msgcache-v1") of the passkey PRF output). The server cannot read it.
// AAD for each ciphertext is "group_id:server_seq" — binding each entry to its location.

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

  let body: {
    action?: string;
    group_id?: string;
    user_id?: string;
    device_id?: string;
    server_seq?: number;
    plaintext_enc?: string;
    since_seq?: number;
  };

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  const { action, group_id, user_id, device_id } = body;

  if (!group_id || !user_id || !device_id) {
    return new Response(JSON.stringify({ error: "group_id, user_id, device_id required" }), {
      status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  // Verify the device belongs to this user
  const { data: deviceData, error: deviceError } = await supabase
    .from("devices")
    .select("user_id")
    .eq("device_id", device_id)
    .single();

  if (deviceError || !deviceData || deviceData.user_id !== user_id) {
    return new Response(JSON.stringify({ error: "Invalid device" }), {
      status: 403, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  // Verify group membership
  const { data: memberData } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", group_id)
    .eq("user_id", user_id)
    .single();

  if (!memberData) {
    return new Response(JSON.stringify({ error: "Not a group member" }), {
      status: 403, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  if (action === "fetch") {
    const since_seq = typeof body.since_seq === "number" ? body.since_seq : 0;

    const { data: rows, error } = await supabase
      .from("message_cache")
      .select("server_seq, plaintext_enc")
      .eq("group_id", group_id)
      .gt("server_seq", since_seq)
      .order("server_seq", { ascending: true });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ messages: rows ?? [] }), {
      status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  if (action === "upsert") {
    const { server_seq, plaintext_enc } = body;

    if (typeof server_seq !== "number" || typeof plaintext_enc !== "string" || plaintext_enc.length === 0) {
      return new Response(JSON.stringify({ error: "server_seq and plaintext_enc required" }), {
        status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { error } = await supabase
      .from("message_cache")
      .upsert({ group_id, server_seq, plaintext_enc, updated_at: new Date().toISOString() });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Unknown action. Use 'upsert' or 'fetch'." }), {
    status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
});
