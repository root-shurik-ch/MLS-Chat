import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Global map for channels per group
const groupChannels = new Map<string, any>();

function getGroupChannel(groupId: string) {
  if (!groupChannels.has(groupId)) {
    const channel = supabase.realtime.channel(`group-${groupId}`, {
      config: { broadcast: { self: true } },
    });
    groupChannels.set(groupId, channel);
  }
  return groupChannels.get(groupId);
}

serve(async (req: Request) => {
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("Expected WebSocket", { status: 400 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  const subscribedGroups = new Set<string>();
  const userId: string | null = null;
  const deviceId: string | null = null;

  socket.onopen = () => {
    console.log("WebSocket opened");
  };

  socket.onmessage = async (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === "subscribe") {
        const { user_id, device_id, groups, auth } = data;

        // Verify user exists
        const { data: userData } = await supabase
          .from("users")
          .select("user_id")
          .eq("user_id", user_id)
          .single();
        if (!userData) {
          throw new Error("Invalid user");
        }

        // Verify device belongs to user
        const { data: deviceData } = await supabase
          .from("devices")
          .select("user_id")
          .eq("device_id", device_id)
          .single();
        if (!deviceData || deviceData.user_id !== user_id) {
          throw new Error("Invalid device");
        }

        // TODO: Verify auth token if needed

        for (const group_id of groups) {
          const channel = getGroupChannel(group_id);
          channel.subscribe((status: string) => {
            if (status === "SUBSCRIBED") {
              console.log(`Subscribed to ${group_id}`);
            }
          });
          subscribedGroups.add(group_id);
        }

        socket.send(JSON.stringify({ type: "subscribed", groups }));
      } else if (data.type === "send") {
        const { group_id, sender_id, device_id, msg_kind, mls_bytes, client_seq } = data;

        // Use RPC to send message atomically
        const { data: result, error } = await supabase.rpc('send_message', {
          p_group_id: group_id,
          p_sender_id: sender_id,
          p_device_id: device_id,
          p_msg_kind: msg_kind,
          p_mls_bytes: mls_bytes,
        });

        if (error) {
          throw error;
        }

        const { server_seq, server_time } = result[0];

        // Broadcast to group channel
        const channel = getGroupChannel(group_id);
        await channel.send({
          type: 'broadcast',
          event: 'message',
          payload: {
            type: "deliver",
            group_id,
            server_seq,
            server_time,
            sender_id,
            device_id,
            msg_kind,
            mls_bytes,
          },
        });
      }
    } catch (e) {
      console.error(e);
      socket.send(JSON.stringify({ error: e.message }));
    }
  };

  socket.onclose = () => {
    console.log("WebSocket closed");
    // Note: Channels remain for other connections
  };

  return response;
});