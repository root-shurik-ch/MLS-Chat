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
    group_id,
    sender_id,
    device_id,
    msg_kind,
    mls_bytes,
    client_seq,
  } = body;

  // Get current seq
  const { data: seqData } = await supabase
    .from("group_seq")
    .select("last_server_seq")
    .eq("group_id", group_id)
    .single();

  const server_seq = (seqData?.last_server_seq || 0) + 1;

  // Insert message
  const { error } = await supabase
    .from("messages")
    .insert({
      group_id,
      server_seq,
      sender_id,
      device_id,
      msg_kind,
      mls_bytes,
    });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }

  // Update seq
  await supabase
    .from("group_seq")
    .upsert({ group_id, last_server_seq: server_seq });

  // Broadcast via Realtime (simplified)
  // Assume Realtime channel for group_id

  return new Response(JSON.stringify({ server_seq }), { status: 200 });
});