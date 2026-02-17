# MLS Chat – System Prompt for Coding Agent

## Project goal

Build an open source, end‑to‑end encrypted chat system based on Messaging Layer Security (MLS).  
Clients are web applications (including iPhone Safari). All MLS state (group trees, keys, message history) is stored client‑side. Servers are minimal and untrusted: they only route ciphertext and never see plaintext or MLS private keys.

The architecture must be cloud‑agnostic. We start with Supabase as the first provider but keep AS (Authentication Service) and DS (Delivery Service) as abstract services that can be re‑implemented on AWS, Cloudflare, or custom servers without changing the client‑side protocol.

## High‑level architecture

Components:

- Web client (SPA):
  - MLS core via WASM + TypeScript wrapper.
  - Identity & key management (WebCrypto + IndexedDB).
  - Service layer:
    - `AuthService` – talks to Authentication Service via HTTP/JSON.
    - `DeliveryService` – talks to Delivery Service via WebSocket/JSON.
- Authentication Service (AS):
  - Handles user registration and login via WebAuthn/passkeys.
  - Stores user profile, passkey public data, MLS public key, and encrypted MLS private key (`mls_sk_enc`).
  - Never sees MLS private key in plaintext.
- Delivery Service (DS):
  - Accepts encrypted MLS messages, assigns `server_seq` within each `group_id`, and delivers them to subscribed clients.
  - Optionally stores messages as an offline buffer with TTL.
  - Does not know any MLS keys and never decrypts messages.

Supabase is used for the first implementation:
- Postgres: `users`, `groups`, `group_members`, `messages`, `group_seq`.
- Realtime: pub/sub channels for `group_id`.
- Edge Functions: HTTP endpoints for `AuthService` and DS send logic.

The client MUST depend only on the abstract `AuthService` and `DeliveryService` interfaces, not on Supabase directly.

## Core domain models

See TypeScript definitions in:

- `client/src/domain/User.ts`
- `client/src/domain/Group.ts`
- `client/src/domain/Message.ts`

These define:
- `UserProfile`, `UserAuthData`
- `GroupMeta`, `GroupMember`
- `OutgoingMessage`, `IncomingMessage`, `MsgKind`

## AuthService protocol (cloud‑agnostic)

Logical HTTP API (implemented first on Supabase via Edge Functions):

`POST /auth/register`:

- Request:
  - `user_id` – stable user id, derived client‑side (e.g. hash of MLS public key).
  - `device_id` – unique device identifier.
  - `display_name`
  - `mls_public_key` (base64)
  - `mls_private_key_enc` (base64) – MLS identity private key encrypted using a key derived from passkey (WebAuthn PRF).
  - `webauthn_create_response` – standard WebAuthn credential response.

- Response:
  - `user_id`
  - `auth_token` – token for subsequent authenticated calls and DS access.
  - `profile` – `{ userId, displayName, avatarUrl? }`

`POST /auth/login`:

- Request:
  - `user_id`
  - `device_id` – unique device identifier.
  - `webauthn_get_response` – WebAuthn assertion.

- Response:
  - `user_id`
  - `auth_token`
  - `mls_private_key_enc`
  - `mls_public_key`
  - `profile`

TypeScript interface: `client/src/services/AuthService.ts`.

## DeliveryService protocol (cloud‑agnostic)

Logical WebSocket protocol (first implemented via Supabase Realtime / WebSocket Edge Function):

Client → DS `subscribe`:

```json
{
  "type": "subscribe",
  "user_id": "string",
  "device_id": "string",
  "groups": ["group-123", "group-456"],
  "auth": "string"   // auth_token or signature
}

DS → Client subscribed:
```json
{
  "type": "subscribed",
  "groups": ["group-123", "group-456"]
}

Client → DS send:
```json
{
  "type": "send",
  "group_id": "string",
  "sender_id": "string",
  "device_id": "string",
  "msg_kind": "handshake" | "chat" | "control",
  "mls_bytes": "base64",
  "client_seq": number
}

DS → Client deliver:
```json
{
  "type": "deliver",
  "group_id": "string",
  "server_seq": number,
  "server_time": number,  // epoch ms
  "sender_id": "string",
  "device_id": "string",
  "msg_kind": "handshake" | "chat" | "control",
  "mls_bytes": "base64"
}

TypeScript interface: client/src/services/DeliveryService.ts.

Rules for this coding agent
Always treat spec/*.md as the source of truth for protocols and data structures.

Whenever you generate or modify code that touches protocols, update the relevant spec/*.md first (or at least keep them consistent).

Never introduce Supabase‑specific details into domain models or protocol structures. Supabase logic must live in adapter files and SQL/Edge Function code only.

All MLS cryptography and MLS state must stay client‑side. Servers (AS, DS) must only operate on ciphertext and public data.

Authentication is passkey/WebAuthn‑based: no passwords. Registration and login flows must follow the outlined WebAuthn patterns, including obtaining a challenge from POST /auth/challenge before creating or getting credentials.

When asked to implement features:

Check relevant spec in spec/.

Implement or modify TypeScript interfaces in client/src/domain or client/src/services.

Implement Supabase adapters in client/src/services/*Supabase.ts and backend SQL/Edge Functions under backend/supabase/.

Keep the design portable to other providers (AWS, Cloudflare, custom servers).

