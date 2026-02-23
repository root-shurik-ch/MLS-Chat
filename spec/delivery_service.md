# DeliveryService Protocol

DeliveryService (DS) is a minimal, mostly stateless message router for MLS ciphertext. It assigns an ordered `server_seq` per `group_id` and delivers messages to subscribed clients. DS never decrypts `mls_bytes`.

**Group id**: Everywhere in this protocol (subscribe, send, deliver), `group_id` is the **server/app group id** (UUID), i.e. the id stored in `groups` and `group_members`. The client must not send the MLS internal group id (hex from WASM); the server looks up membership and stores messages by UUID.

## WebSocket Messages

### Subscribe

Client → DS:

```json
{
  "type": "subscribe",
  "user_id": "string",
  "device_id": "string",
  "groups": ["group-123", "group-456"],
  "auth": "string"
}
```

`auth` is typically an `auth_token` obtained from AuthService.

DS → Client:

```json
{
  "type": "subscribed",
  "groups": ["group-123", "group-456"]
}
```

### Ping / Pong

Client → DS:
```json
{ "type": "ping", "timestamp": 1234567890 }
```

DS → Client:
```json
{ "type": "pong", "timestamp": 1234567890 }
```

Send every 30 s. Also used to update `last_seen` for online presence.

### Send

Client → DS:

```json
{
  "type": "send",
  "group_id": "string",
  "sender_id": "string",
  "device_id": "string",
  "msg_kind": "handshake" | "chat" | "control" | "commit",
  "mls_bytes": "base64",
  "client_seq": 0
}
```

### Deliver

DS → Client:

```json
{
  "type": "deliver",
  "group_id": "string",
  "server_seq": 0,
  "server_time": 0,
  "sender_id": "string",
  "device_id": "string",
  "msg_kind": "handshake" | "chat" | "control" | "commit",
  "mls_bytes": "base64"
}
```

`server_seq` is a monotonically increasing integer per `group_id`.

`server_time` is a server timestamp (epoch milliseconds).

## Message Kinds

| `msg_kind` | Description |
|---|---|
| `chat` | An MLS application message containing encrypted plaintext. Decrypted and displayed by recipients. **Implemented.** |
| `commit` | An MLS Commit distributing an epoch advance (e.g. from `add_member`) to existing group members. **Never displayed as a chat message.** Clients call `applyCommit` when receiving this kind and save the updated WASM state. **Implemented.** |
| `handshake` | An MLS handshake message (Proposal or Commit sent directly via DS by a client). **Reserved — not used by the current client.** |
| `control` | Application-level control messages (e.g. group rename, typing indicators). **Reserved — not yet implemented.** |

### `commit` message semantics

A `commit` message is injected server-side by `invite_complete` (via the `send_message` Postgres RPC and a Supabase Realtime broadcast) when a new member is added to a group. It carries the raw hex Commit bytes returned by WASM `addMember`.

**Who sends it:** The processor (the member who ran `addMember`) does NOT send the commit via the client WebSocket `send` message. Instead, `invite_complete` inserts it directly into the `messages` table using the `send_message` RPC so it is reliably stored even if the DS client is not connected.

**Who consumes it:** Every existing group member *other than the processor* must apply this commit to advance from epoch N to N+1:
- Connected members receive a Realtime `deliver` broadcast immediately.
- Offline members receive it via `get_messages` history replay on reconnect.

In both cases the client calls `mlsClient.applyCommit(mlsGroup, { proposals: [], commit: mls_bytes, epochAuthenticator: '' })` and saves the resulting WASM state. Failed `applyCommit` calls (e.g. when the joiner's client receives its own commit after already being at N+1 via `processWelcome`) are silently swallowed.

**DS sender_id filter:** The DS WebSocket `onDeliver` handler in `Chat.tsx` skips messages where `senderId === userId && deviceId === deviceId` (own device). The processor's own device therefore does not double-apply: WASM `addMember` already calls `merge_pending_commit` internally, leaving the processor at N+1.

---

## Message Ordering Guarantees

Per RFC 9750, messages are delivered in the order they are sent. The `server_seq` ensures total ordering within a group.

- Handshake messages (Proposals, Commits) are processed before application messages.
- Clients must buffer out-of-order messages until they can be processed in sequence.

## Commit Conflict Resolution

If multiple Commits arrive concurrently, the DS assigns `server_seq` based on arrival time. Clients resolve conflicts using MLS rules:

- The Commit with the lowest `server_seq` is applied first.
- Subsequent Commits may be rejected if they conflict (e.g., overlapping Proposals).

See RFC 9750 Section 12 for details on Commit validation.

## Message History & Offline Recovery

Messages are stored with a TTL (e.g., 30 days). Offline clients recover by calling the `get_messages` Edge Function.

**Request:** `POST /functions/v1/get_messages`

```json
{
  "group_id": "string",
  "user_id": "string",
  "device_id": "string",
  "since_seq": 0,
  "limit": 200
}
```

- `since_seq` (optional, default 0): fetch only messages with `server_seq > since_seq`. On initial load omit or pass 0. On reconnect pass the highest `server_seq` seen so far to fetch only missed messages.
- `limit` (optional, default 200, max 1000): maximum number of rows returned. Callers may pass a smaller value for performance; the server caps at 1000.

**Response:**

```json
{
  "messages": [
    {
      "server_seq": 1,
      "server_time": 1234567890,
      "sender_id": "string",
      "device_id": "string",
      "msg_kind": "handshake",
      "mls_bytes": "base64"
    }
  ]
}
```

Messages are returned in `server_seq` ASC order. Clients replay the history to catch up.

## Subscribe — Idempotency & Reconnection

`subscribe` is idempotent: a second call while a subscribe is already in flight or already complete is a no-op (returns immediately without sending a second WS frame).

On reconnect the `DeliveryServiceSupabase` adapter resubscribes automatically via its internal `onStateChange → CONNECTED` handler. The `subscribed` flag is reset to `false` on `DISCONNECTED` and `RECONNECTING` state transitions so the auto-resubscribe fires correctly on the next `CONNECTED`.

Client components (e.g. `Chat.tsx`) must guard their own subscribe call:

```typescript
if (deliveryService.isConnected()) {
  await deliveryService.subscribe({ userId, deviceId, groups: [groupId] });
}
```

This prevents a "Not connected" error when the component mounts while the WebSocket is still reconnecting. The adapter's auto-resubscribe handles that case instead.

## Out-of-Order Handling

Clients buffer messages with `server_seq` higher than expected. Once the missing message arrives, process in order.

- If a message is missing for too long, trigger offline recovery.
- Ensure no gaps in `server_seq` for integrity.

## Heartbeat / Presence

Clients send a `ping` every **30 seconds** to keep the WebSocket alive and update online presence.

```json
{ "type": "ping", "timestamp": 1234567890 }
```

DS responds immediately with:

```json
{ "type": "pong", "timestamp": 1234567890 }
```

And fire-and-forgets a `last_seen` update for the authenticated user:

```sql
UPDATE users SET last_seen = NOW() WHERE user_id = $1;
```

The same update is also fired when the client successfully authenticates via `subscribe`.

**Online threshold:** `last_seen > NOW() - INTERVAL '2 minutes'`. With a 30 s ping interval, this allows ~4 missed heartbeats before a user appears offline. See `group_members_list` for how this is exposed to clients.
