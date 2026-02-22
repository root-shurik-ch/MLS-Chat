// Shared Web Push helper for Supabase Edge Functions.
// Requires VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY env vars.

// @deno-types="https://esm.sh/v135/web-push@3.6.7/src/index.d.ts"
import webpush from "https://esm.sh/web-push@3.6.7?target=deno";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:dev@minimum.chat",
  Deno.env.get("VAPID_PUBLIC_KEY") ?? "",
  Deno.env.get("VAPID_PRIVATE_KEY") ?? "",
);

export async function sendPushToGroupMembers(
  supabase: SupabaseClient,
  groupId: string,
  payload: { title: string; body?: string; data?: Record<string, unknown> },
): Promise<void> {
  // Fetch all user_ids for the group
  const { data: memberRows } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId);

  const memberIds = (memberRows ?? []).map((r: { user_id: string }) => r.user_id);
  if (memberIds.length === 0) return;

  // Fetch push subscriptions for those members
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .in("user_id", memberIds);

  for (const sub of (subs ?? [])) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 86400 },
      );
    } catch (err: unknown) {
      const status = (err as { statusCode?: number })?.statusCode;
      if (status === 410 || status === 404) {
        // Subscription expired — clean up
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      } else {
        console.error("[push] sendNotification error:", err);
      }
    }
  }
}
