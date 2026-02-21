# Group Management Protocol

This document describes the Edge Functions that manage groups and invite flows. All endpoints require `user_id` + `device_id` for authentication (device ownership validated against the `devices` table). The `invite_info` endpoint is the only public exception.

---

## Database Schema

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
| `welcome_hex` | text | Inviter's MLS Welcome (hex); set at `complete` |
| `status` | text | `'pending'` → `'kp_submitted'` → `'complete'` |
| `created_at` | timestamptz | |
| `expires_at` | timestamptz | `NOW() + 7 days`; enforced by `invite_join` |

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

## Invite Endpoints

The invite flow replaces manual hex copy-paste with a shareable link. E2E encryption is preserved — the server sees only public KP bytes and the encrypted Welcome ciphertext.

```
Admin                         Server                       Joiner
  |-- invite_create --------> |                            |
  |<-- { invite_id } -------- |                            |
  |  shares ?join=<id>        |                            |
  |                           | <-- invite_info(id) -----  |
  |                           | --> { group_name } ------  |
  |                           | <-- invite_join(id, kp) -  |
  |-- invite_pending -------> |                            |
  |<-- [{ invite_id, kp }] -- |                            |
  |  addMember WASM           |                            |
  |-- invite_complete(id, w) >|                            |
  |                           | <-- invite_poll(id) -----  |
  |                           | --> { welcome_hex } -----  |
  |                           |     processWelcome + join   |
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

Called by the **inviter** to poll for joiners who have submitted their KeyPackage. Returns all invites where `inviter_id = user_id AND status = 'kp_submitted'`.

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

### POST /functions/v1/invite_complete

Called by the **inviter** after running WASM `addMember`. Delivers the encrypted Welcome and transitions status to `complete`.

Request:
```json
{
  "invite_id": "uuid",
  "user_id": "string",
  "device_id": "string",
  "welcome_hex": "string"
}
```

Response `200`:
```json
{ "ok": true }
```

Errors: `403` caller is not the inviter, `409` invite not in `kp_submitted` status.

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

### Inviter side (`InviteLink.tsx` in Chat panel)

1. On mount: calls `invite_create` → stores `invite_id`, constructs and displays invite URL.
2. Polls `invite_pending` every **5 s**.
3. When a matching KP arrives: calls WASM `addMember(group, kp)` → gets `welcome_hex`.
4. Calls `invite_complete(invite_id, welcome_hex)`.
5. Saves updated WASM state (epoch advanced).
6. Shows "Member joined successfully."

### Joiner side (`InviteJoinView.tsx`, shown after login if `?join=` in URL)

1. On mount: calls `invite_info(invite_id)` → shows group name.
2. User clicks "Join Group" → calls WASM `generateKeyPackage()` → calls `invite_join`.
3. Polls `invite_poll` every **3 s**.
4. When `welcome_hex` arrives: calls WASM `processWelcome(welcome_hex)`.
5. Calls `group_join` to register membership on server.
6. Saves WASM state + navigates to group chat.

### Background processing on login (`App.tsx` `processPendingInvites`)

On every login, `App.tsx` silently calls `invite_pending` once after `initializeServices`. Any invites with unprocessed KPs are handled automatically — the inviter does not need to have the invite panel open.
