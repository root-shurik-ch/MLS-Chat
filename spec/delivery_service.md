# DeliveryService Protocol

DeliveryService (DS) is a minimal, mostly stateless message router for MLS ciphertext. It assigns an ordered `server_seq` per `group_id` and delivers messages to subscribed clients. DS never decrypts `mls_bytes`.

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

### Send

Client → DS:

```json
{
  "type": "send",
  "group_id": "string",
  "sender_id": "string",
  "device_id": "string",
  "msg_kind": "handshake" | "chat" | "control",
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
  "msg_kind": "handshake" | "chat" | "control",
  "mls_bytes": "base64"
}
```

`server_seq` is a monotonically increasing integer per `group_id`.

`server_time` is a server timestamp (epoch milliseconds).

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

Messages are stored with a TTL (e.g., 30 days). Offline clients can recover by calling `GET /messages`:

Request: `GET /messages?group_id=...&after_server_seq=...&auth=...`

Response:

```json
{
  "messages": [
    {
      "group_id": "string",
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

Clients replay the history to catch up.

## Out-of-Order Handling

Clients buffer messages with `server_seq` higher than expected. Once the missing message arrives, process in order.

- If a message is missing for too long, trigger offline recovery.
- Ensure no gaps in `server_seq` for integrity.
