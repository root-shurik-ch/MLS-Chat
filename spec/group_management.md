# Group Management Protocol

This document describes the Edge Functions that manage groups and invite flows. All endpoints require `user_id` + `device_id` for authentication (device ownership validated against the `devices` table). The `invite_info` endpoint is the only public exception.

---

## Database Schema

### `users`

| Column | Type | Notes |
|---|---|---|
| `user_id` | text PK | Derived from MLS public key: `base64url(SHA256(mls_public_key_bytes))` |
| `avatar_url` | text | Optional profile picture |
| `last_seen` | timestamptz | Updated on DS connect (`subscribe`) and every heartbeat (`ping`). Used for online presence. `NULL` = never connected. |

### `groups`

| Column | Type | Notes |
|---|---|---|
| `group_id` | text PK | Server/app UUID for this group |
| `name` | text | Human-readable group name |
| `avatar_url` | text | Optional avatar |
| `ds_url` | text | WebSocket URL of the Delivery Service |

### `group_members`

| Column | Type | Notes |
|---|---|---|
| `group_id` | text FK → groups | |
| `user_id` | text FK → users | User-level membership (one record per user, not per device) |
| `role` | text | `'member'` (default) |

### `group_seq`

| Column | Type | Notes |
|---|---|---|
| `group_id` | text PK FK → groups | |
| `last_server_seq` | bigint | Monotonically increasing message counter |

### `invites`

| Column | Type | Notes |
|---|---|---|
| `invite_id` | text PK | `gen_random_uuid()` |
| `group_id` | text FK → groups | Target group |
| `group_name` | text | Denormalized group name (shown before login) |
| `inviter_id` | text FK → users | User who created the invite |
| `joiner_id` | text FK → users | Set when joiner submits their KP |
| `kp_hex` | text | Joiner's MLS KeyPackage (hex); set at `kp_submitted` |
| `welcome_hex` | text | MLS Welcome (hex); set at `complete` |
| `commit_hex` | text | MLS Commit (hex); set at `complete` when provided; used by existing members to advance their epoch |
| `status` | text | `'pending'` → `'kp_submitted'` → `'complete'` |
| `claimed_by` | text FK → users | User currently holding the processing claim; prevents parallel double-processing |
| `claimed_at` | timestamptz | When the claim was taken; claims older than 2 minutes are considered stale and may be overridden |
| `created_at` | timestamptz | |
| `expires_at` | timestamptz | `NOW() + 7 days`; enforced by `invite_join` |

### `push_subscriptions`

| Column | Type | Notes |
|---|---|---|
| `sub_id` | text PK | `gen_random_uuid()` |
| `user_id` | text FK → users | Owning user; CASCADE DELETE |
| `device_id` | text FK → devices | Owning device; CASCADE DELETE; UNIQUE (one subscription per device) |
| `endpoint` | text | Browser push endpoint URL |
| `p256dh` | text | ECDH public key (base64url) from the browser push subscription |
| `auth` | text | Authentication secret (base64url) from the browser push subscription |
| `created_at` | timestamptz | |

---

## Group Endpoints

### POST /functions/v1/group_create

Creates a new group, inserts the creator as its first member, and initialises `group_seq`.

Request:
```json
{
  "group_id": "uuid",
  "name": "string",
  "avatar_url": "string | null",
  "user_id": "string",
  "device_id": "string",
  "ds_url": "string (optional)"
}
```

Response `200`:
```json
{ "group_id": "uuid", "name": "string" }
```

Errors: `400` missing fields, `404` user/device not found, `409` group already exists.

---

### POST /functions/v1/group_join

Registers a user as a group member. Idempotent — returns `200` if already a member (duplicate key `23505`).

Request:
```json
{ "group_id": "uuid", "user_id": "string", "device_id": "string" }
```

Response `200`:
```json
{ "group_id": "uuid" }
```

---

### POST /functions/v1/group_delete

Deletes a group and all its messages (CASCADE). Only the invoking user must be a member.

Request:
```json
{ "group_id": "uuid", "user_id": "string", "device_id": "string" }
```

Response `200`:
```json
{ "ok": true }
```

---

### POST /functions/v1/user_groups

Returns all groups the user is a member of.

Request:
```json
{ "user_id": "string", "device_id": "string" }
```

Response `200`:
```json
{
  "groups": [
    { "group_id": "uuid", "name": "string", "avatar_url": "string|null", "ds_url": "string" }
  ]
}
```

---

## Postgres RPCs

### `claim_invite(p_invite_id TEXT, p_user_id TEXT) → boolean`

Atomically claims an invite for a single processor. Returns `TRUE` if the caller won the claim (or already holds it), `FALSE` if another member currently holds an unexpired claim.

The claim is set by `UPDATE … WHERE status = 'kp_submitted' AND (claimed_by IS NULL OR claimed_at < NOW() - INTERVAL '2 minutes' OR claimed_by = p_user_id)`. A claim older than 2 minutes is considered stale and can be overridden, preventing a crashed processor from blocking the invite indefinitely.

### `get_pending_invites_for_member(p_user_id TEXT) → TABLE(invite_id, group_id, kp_hex)`

Returns all `kp_submitted` invites for groups where `p_user_id` is a member, filtering to rows that are unclaimed, stale-claimed, or self-claimed. This replaces the old `inviter_id = user_id` filter: **any group member** can process pending invites, not just the original inviter.

---

## Invite Endpoints

The invite flow replaces manual hex copy-paste with a shareable link. E2E encryption is preserved — the server sees only public KP bytes and the encrypted Welcome ciphertext.

Any existing group member can process a pending invite (not just the original inviter). Concurrent processing is prevented by the `invite_claim` atomic claim step.

```
[Any member]                  Server                       Joiner
  |-- invite_create --------> |                            |
  |<-- { invite_id } -------- |                            |
  |  shares ?join=<id>        |                            |
  |                           | <-- invite_info(id) -----  |
  |                           | --> { group_name } ------  |
  |                           | <-- invite_join(id, kp) -  |
  |                           | --> push notification ---> [all members]
  |-- invite_pending -------> |                            |
  |<-- [{ invite_id, kp }] -- |                            |
  |-- invite_claim(id) -----> |                            |
  |<-- { claimed: true } ----- |                           |
  |  addMember WASM → commit + welcome                     |
  |-- invite_complete(id,     |                            |
  |     welcome, commit) ---> |                            |
  |                           | → send_message(commit) to DB + Realtime
  |                           | <-- invite_poll(id) -----  |
  |                           | --> { welcome_hex } -----  |
  |                           |     processWelcome + join   |
[other existing members receive 'commit' deliver via DS and call applyCommit]
```

---

### POST /functions/v1/invite_create

Called by the **inviter** (who is already a group member) to generate an invite token.

Request:
```json
{ "group_id": "uuid", "user_id": "string", "device_id": "string" }
```

Response `200`:
```json
{ "invite_id": "uuid" }
```

The client constructs the shareable URL: `${window.location.origin}?join=<invite_id>`.

Errors: `403` if user is not a group member, `404` group not found.

---

### POST /functions/v1/invite_info

**Public — no auth required.** Returns enough info for the join screen to show the group name before the joiner logs in.

Request:
```json
{ "invite_id": "uuid" }
```

Also accepts `GET` with `?invite_id=<uuid>`.

Response `200`:
```json
{ "group_name": "string", "status": "pending|kp_submitted|complete", "expired": false }
```

Errors: `404` invite not found.

---

### POST /functions/v1/invite_join

Called by the **joiner** to submit their MLS KeyPackage. Transitions status from `pending` → `kp_submitted`.

Request:
```json
{
  "invite_id": "uuid",
  "user_id": "string",
  "device_id": "string",
  "kp_hex": "string"
}
```

Response `200`:
```json
{ "ok": true }
```

Errors: `404` invite not found, `409` invite not in `pending` status, `410` invite expired.

---

### POST /functions/v1/invite_pending

Called by **any group member** to poll for joiners who have submitted their KeyPackage. Internally calls the `get_pending_invites_for_member` RPC, which returns all `kp_submitted` invites for groups the caller belongs to (unclaimed or stale-claimed only). This is no longer restricted to the original inviter.

Request:
```json
{ "user_id": "string", "device_id": "string" }
```

Response `200`:
```json
{
  "invites": [
    { "invite_id": "uuid", "group_id": "uuid", "kp_hex": "string" }
  ]
}
```

---

### POST /functions/v1/invite_claim

Called by a **group member** before calling `addMember` WASM to atomically claim processing rights for an invite. If `claimed: false` is returned, another member already holds the claim and the caller must skip this invite.

Request:
```json
{
  "invite_id": "uuid",
  "user_id": "string",
  "device_id": "string"
}
```

Response `200`:
```json
{ "claimed": true | false }
```

Errors: `400` missing fields, `403` caller is not a group member, `404` invite or device not found, `500` DB error.

---

### POST /functions/v1/invite_complete

Called by the **processor** (any group member that won the claim) after running WASM `addMember`. Delivers the encrypted Welcome, stores the Commit for epoch synchronisation, and transitions status to `complete`.

Auth changed from `inviter_id` check to `is_group_member` RPC — any existing group member may complete an invite.

When `commit_hex` is provided, the function:
1. Calls the `send_message` RPC to persist the commit as a `msg_kind: 'commit'` message in the group's message log (for offline recovery).
2. Broadcasts a `deliver` event via Supabase Realtime to any currently-connected group members so they can apply the commit immediately (best-effort; non-blocking).

Request:
```json
{
  "invite_id": "uuid",
  "user_id": "string",
  "device_id": "string",
  "welcome_hex": "string",
  "commit_hex": "string (optional)"
}
```

Response `200`:
```json
{ "ok": true }
```

Errors: `403` caller is not a group member, `409` invite not in `kp_submitted` status, `404` invite or device not found.

---

### POST /functions/v1/invite_poll

Called by the **joiner** to poll for the Welcome. Only the joiner (the user who submitted the KP) can poll.

Request:
```json
{ "invite_id": "uuid", "user_id": "string", "device_id": "string" }
```

Response `200`:
```json
{
  "status": "kp_submitted|complete",
  "welcome_hex": "string (present when status = complete)",
  "group_id": "uuid"
}
```

Errors: `403` caller is not the joiner, `404` invite not found.

---

## Client-Side Invite Flow

### Processor side (`InviteLink.tsx` in Chat panel)

Any group member with the invite panel open can process a pending KP. The component:

1. On mount: calls `invite_create` → stores `invite_id`, constructs and displays invite URL.
2. Polls `invite_pending` every **5 s**.
3. When a KP arrives:
   a. Calls `invite_claim` → if `claimed: false`, skips (another member is processing it).
   b. Calls WASM `addMember(group, kp)` → gets `{ welcome_hex, commit_hex }`.
   c. Calls `invite_complete(invite_id, welcome_hex, commit_hex)`.
   d. Saves updated WASM state (epoch advanced).
4. Shows "Member joined successfully."

### Joiner side (`InviteJoinView.tsx`, shown after login if `?join=` in URL)

1. On mount: calls `invite_info(invite_id)` → shows group name.
2. User clicks "Join Group" → calls WASM `generateKeyPackage()` → calls `invite_join`.
3. Polls `invite_poll` every **3 s**.
4. When `welcome_hex` arrives: calls WASM `processWelcome(welcome_hex)` — this brings the joiner directly to epoch N+1. The joiner must NOT call `applyCommit` on the same commit.
5. Calls `group_join` to register membership on server.
6. Saves WASM state + navigates to group chat.

### Background processing (`App.tsx` `processPendingInvites`)

Runs once on every login after `initializeServices`, and then every **30 seconds** via a background poll. Any group member's device can process pending invites automatically — the original inviter does not need to have the invite panel open.

For each pending invite:
1. Calls `invite_claim` — skips if `claimed: false`.
2. Loads the MLS group from IndexedDB / WASM state.
3. Calls WASM `addMember(group, kp)`.
4. Calls `invite_complete` with both `welcome_hex` and `commit_hex`.
5. Saves WASM state **only after** a successful `invite_complete` response (prevents persisting an advanced epoch if delivery fails).

### Existing members: epoch synchronisation

When `invite_complete` distributes the commit, existing members (other than the processor) receive a `msg_kind: 'commit'` message via the DS:
- **Connected members** receive it via Realtime broadcast immediately.
- **Offline members** receive it on reconnect via `get_messages` history replay.

In both cases, `Chat.tsx` calls `mlsClient.applyCommit(...)` on the commit message and saves the updated WASM state. Commit messages are never displayed as chat messages.

---

## Web Push Notifications

### Overview

When a joiner submits their KeyPackage via `invite_join`, a Web Push notification is sent to all existing group members so that offline browsers can wake up and process the pending invite without requiring the user to actively poll.

Push subscriptions are stored in `push_subscriptions` (one per device). The server uses VAPID authentication (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` Supabase secrets) and the `web-push` library.

### POST /functions/v1/push_register

Called by the client after login to register (or refresh) the browser's push subscription for this device. Upserts on `device_id` so re-registration is safe.

Request:
```json
{
  "user_id": "string",
  "device_id": "string",
  "subscription": {
    "endpoint": "string",
    "p256dh": "string",
    "auth": "string"
  }
}
```

Response `200`:
```json
{ "ok": true }
```

Errors: `400` missing fields, `404` device not found or not owned by user, `500` DB error.

### Client registration (`utils/pushNotifications.ts`)

`registerPushNotifications(userId, deviceId)` is called on every successful login and session resume (best-effort, non-blocking). It:
1. Registers `sw.js` as the service worker (if not already registered).
2. Requests browser notification permission — silently aborts if denied.
3. Subscribes via `PushManager.subscribe` using the VAPID public key from `VITE_VAPID_PUBLIC_KEY`.
4. POSTs the resulting `{ endpoint, p256dh, auth }` to `push_register`.

### Service worker (`client/public/sw.js`)

Handles two events:
- `push` — calls `self.registration.showNotification(title, { body, data })`.
- `notificationclick` — focuses the existing app window or opens a new one.

### Push trigger

`invite_join` fires a fire-and-forget push to all group members via the `sendPushToGroupMembers` helper (`supabase/_shared/push.ts`) after successfully recording the KP. The payload is:
```json
{ "title": "Someone wants to join", "body": "Open the app to let them in.", "data": { "type": "pending_invite", "group_id": "..." } }
```

Expired subscriptions (HTTP 410/404 from the push gateway) are automatically deleted from `push_subscriptions`.

---

## Presence

`last_seen` on the `users` table is updated in two places by the DS (`ds_send` Edge Function):

1. **On `subscribe`** — immediately when a client authenticates its WebSocket connection.
2. **On `ping`** — fire-and-forget update alongside each pong response (heartbeat every ~30 s).

**Online threshold:** `last_seen > NOW() - INTERVAL '2 minutes'` (~4 missed heartbeats).

---

## POST /functions/v1/group_members_list

Returns the member list and pending invites for a group.

**Auth:** device ownership (device → user match in `devices`) + `is_group_member` RPC.

Request:
```json
{ "group_id": "uuid", "user_id": "string", "device_id": "string" }
```

Response `200`:
```json
{
  "members": [
    {
      "user_id": "string",
      "avatar_url": "string | null",
      "is_online": true,
      "last_seen": "2026-02-22T10:00:00Z | null"
    }
  ],
  "pending": [
    {
      "invite_id": "uuid",
      "status": "pending | kp_submitted",
      "created_at": "2026-02-22T10:00:00Z"
    }
  ]
}
```

`pending` contains only invites where `status IN ('pending', 'kp_submitted') AND expires_at > NOW()`.

Errors: `403` device mismatch or not a group member, `500` query failure.
