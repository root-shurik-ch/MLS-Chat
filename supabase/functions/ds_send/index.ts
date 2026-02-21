import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCorsPreflight } from "../../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const groupChannels = new Map<string, any>();
const groupRefCount = new Map<string, number>();

function getGroupChannel(groupId: string) {
  if (!groupChannels.has(groupId)) {
    const channel = supabase.realtime.channel(`group-${groupId}`, {
      config: { broadcast: { self: true } },
    });
    groupChannels.set(groupId, channel);
  }
  return groupChannels.get(groupId);
}

Deno.serve(async (req: Request) => {
  const upgrade = req.headers.get("upgrade");
  const origin = req.headers.get("origin");
  console.log("[ds_send] method=%s upgrade=%s origin=%s", req.method, upgrade ?? "(none)", origin ?? "(none)");

  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (upgrade?.toLowerCase() !== "websocket") {
    console.log("[ds_send] Rejecting: missing or invalid Upgrade header");
    return new Response("Expected WebSocket", { status: 400, headers: corsHeaders(req) });
  }

  let socket: WebSocket;
  let response: Response;
  try {
    const result = Deno.upgradeWebSocket(req);
    socket = result.socket;
    response = result.response;
  } catch (err) {
    console.error("[ds_send] upgradeWebSocket failed:", err);
    return new Response("WebSocket upgrade failed", { status: 500, headers: corsHeaders(req) });
  }
  console.log("[ds_send] WebSocket upgrade accepted, status=%s", response.status);
  // Return the original response; wrapping in new Response() can cause 502 at the gateway

  const subscribedGroups = new Set<string>();
  const broadcastListeners: Array<{ groupId: string; channel: any; callback: (payload: any) => void }> = [];
  let userId: string | null = null;
  let deviceId: string | null = null;
  let authenticated = false;

  const deliveredMessages = new Set<number>();

  socket.onopen = () => {
    console.log("WebSocket connection opened");
  };

  socket.onmessage = async (event) => {
    try {
      const data = JSON.parse(event.data);

      // Handle ping/pong for heartbeat
      if (data.type === "ping") {
        socket.send(JSON.stringify({
          type: "pong",
          timestamp: data.timestamp
        }));
        return;
      }

      // Handle subscribe
      if (data.type === "subscribe") {
        const { user_id, device_id: dev_id, groups, auth } = data;

        // Verify user exists
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("user_id")
          .eq("user_id", user_id)
          .single();

        if (userError || !userData) {
          socket.send(JSON.stringify({
            type: "error",
            context: "subscribe",
            error: "Invalid user"
          }));
          return;
        }

        // Verify device belongs to user
        const { data: deviceData, error: deviceError } = await supabase
          .from("devices")
          .select("user_id")
          .eq("device_id", dev_id)
          .single();

        if (deviceError || !deviceData || deviceData.user_id !== user_id) {
          socket.send(JSON.stringify({
            type: "error",
            context: "subscribe",
            error: "Invalid device"
          }));
          return;
        }

        // TODO: Verify auth token if needed
        // For now, accept if user and device are valid

        userId = user_id;
        deviceId = dev_id;
        authenticated = true;

        for (const group_id of groups) {
          const channel = getGroupChannel(group_id);

          const callback = (payload: any) => {
            const msg = payload.payload;
            if (msg.server_seq && deliveredMessages.has(msg.server_seq)) return;
            if (msg.sender_id === userId && msg.device_id === deviceId) return;
            if (msg.server_seq) deliveredMessages.add(msg.server_seq);
            socket.send(JSON.stringify(msg));
          };

          channel.on('broadcast', { event: 'message' }, callback);
          broadcastListeners.push({ groupId: group_id, channel, callback });

          const refCount = (groupRefCount.get(group_id) ?? 0) + 1;
          groupRefCount.set(group_id, refCount);
          if (refCount === 1) {
            await channel.subscribe((status: string) => {
              if (status === "SUBSCRIBED") {
                console.log(`User ${user_id} subscribed to group ${group_id}`);
              } else if (status === "CHANNEL_ERROR") {
                console.error(`Failed to subscribe to group ${group_id}`);
              }
            });
          }

          subscribedGroups.add(group_id);
        }

        socket.send(JSON.stringify({
          type: "subscribed",
          groups: Array.from(subscribedGroups)
        }));

        return;
      }

      // Handle send message
      if (data.type === "send") {
        if (!authenticated) {
          socket.send(JSON.stringify({
            type: "error",
            context: "send",
            client_seq: data.client_seq,
            error: "Not authenticated"
          }));
          return;
        }

        const { group_id, sender_id, device_id: dev_id, msg_kind, mls_bytes, client_seq } = data;

        // Validate sender matches authenticated user
        if (sender_id !== userId || dev_id !== deviceId) {
          socket.send(JSON.stringify({
            type: "error",
            context: "send",
            client_seq,
            error: "Sender mismatch"
          }));
          return;
        }

        // Verify user is a member of the group via user-level is_group_member() helper
        const { data: isMember, error: memberError } = await supabase
          .rpc("is_group_member", { p_group_id: group_id, p_user_id: userId });

        if (memberError || !isMember) {
          console.error("[ds_send] Not a group member:", {
            group_id,
            user_id: userId,
            memberError: memberError?.message,
          });
          socket.send(JSON.stringify({
            type: "error",
            context: "send",
            client_seq,
            error: "Not a group member"
          }));
          return;
        }

        // sender_id stores the user_id (from authenticated session), device_id stores dev_id
        const { data: result, error } = await supabase.rpc('send_message', {
          p_group_id: group_id,
          p_sender_id: sender_id,
          p_device_id: dev_id,
          p_msg_kind: msg_kind,
          p_mls_bytes: mls_bytes,
        });

        if (error) {
          console.error("Failed to send message:", error);
          socket.send(JSON.stringify({
            type: "error",
            context: "send",
            client_seq,
            error: error.message
          }));
          return;
        }

        const { server_seq, server_time } = result[0];

        // Send acknowledgment to sender
        socket.send(JSON.stringify({
          type: "ack",
          client_seq,
          server_seq,
          success: true
        }));

        // Broadcast to all group members via group channel
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
            device_id: dev_id,
            msg_kind,
            mls_bytes,
          },
        });

        console.log(`Message sent: group=${group_id}, seq=${server_seq}`);
        return;
      }

      // Unknown message type
      socket.send(JSON.stringify({
        type: "error",
        error: "Unknown message type"
      }));

    } catch (e) {
      console.error("WebSocket message error:", e);
      socket.send(JSON.stringify({
        type: "error",
        error: e.message
      }));
    }
  };

  socket.onclose = () => {
    console.log("WebSocket closed for user:", userId);

    for (const { groupId, channel, callback } of broadcastListeners) {
      channel.off('broadcast', { event: 'message' }, callback);
      const refCount = (groupRefCount.get(groupId) ?? 1) - 1;
      groupRefCount.set(groupId, refCount);
      if (refCount <= 0) {
        groupRefCount.delete(groupId);
        groupChannels.delete(groupId);
        channel.unsubscribe();
      }
    }

    subscribedGroups.clear();
    deliveredMessages.clear();
  };

  socket.onerror = (error) => {
    console.error("WebSocket error:", error);
  };

  return response;
});