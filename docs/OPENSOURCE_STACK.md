# Open Source Stack — What We Use and How

This document describes the technologies and patterns used in MLS-Chat for contributors and self-hosters.

---

## Overview

- **Client**: React SPA (Vite), TypeScript. MLS cryptography runs in WebAssembly (Rust/OpenMLS). Auth is passkey-only (WebAuthn).
- **Backend**: Supabase (PostgreSQL, Edge Functions on Deno). No Supabase Auth — we use custom WebAuthn flows.
- **E2E**: All message content is encrypted with MLS; keys stay on the client. Server only sees ciphertext and metadata.

---

## Authentication (WebAuthn / Passkeys)

### Flow

1. **Challenge** — Client calls `auth_challenge` with `action: "register"` or `"login"` and (for login) `name_or_id` (user name). Server creates a random challenge, stores it in `challenges`, returns `challenge_id` and `challenge` (base64url).
2. **Browser** — Client uses the Web Authn API (`navigator.credentials.create` or `get`) with that challenge; origin and rpId are taken from the request (e.g. `https://app.minimum.chat`).
3. **Register** — Client sends the registration response to `auth_register` with `user_id` (display name), `device_id`, and the WebAuthn response. Server verifies with SimpleWebAuthn, then creates `users` and `devices` (MLS keys), stores passkey credential id and public key.
4. **Login** — Client sends the authentication response to `auth_login` with `challenge_id`, `user_id`, `device_id`, and the WebAuthn get response. Server verifies with SimpleWebAuthn and returns auth token + MLS keys for the device.

### Server-side library: SimpleWebAuthn v13

- We use **@simplewebauthn/server v13** (Deno-compatible; no Node `Buffer`).
- **Import**: from `https://esm.sh/@simplewebauthn/server@13` in Edge Functions.
- **Registration**: `verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin, expectedRPID })`. We store `credential.id` (base64url) and `credential.publicKey` as `JSON.stringify(Array.from(publicKey))` in `users.passkey_credential_id` and `users.passkey_public_key`.
- **Login**: `verifyAuthenticationResponse({ response, expectedChallenge, expectedOrigin, expectedRPID, credential })` where `credential` is `{ id, publicKey, counter, transports }` (v13 API). `id` = `passkey_credential_id` (string), `publicKey` = `new Uint8Array(JSON.parse(passkey_public_key))`.

### Shared helpers (`supabase/_shared/webauthn.ts`)

- `bytesToBase64Url` / `base64UrlToBytes` — conversion for challenge and raw IDs.
- `challengeToBase64Url` — normalizes DB challenge to base64url (handles legacy base64).

### CORS and origin

- Origin and rpId for WebAuthn are derived from the request (e.g. `Origin` header or host). See `supabase/_shared/cors.ts` (`getWebAuthnOriginAndRpId`). For production, frontend and Edge Functions must agree on the same origin/rpId (e.g. `https://app.minimum.chat`).

---

## Supabase Edge Functions (Deno)

| Function        | Purpose |
|----------------|--------|
| `auth_challenge` | Creates and stores a WebAuthn challenge for register or login. |
| `auth_register`  | Verifies WebAuthn registration, creates user + device, stores passkey. |
| `auth_login`     | Verifies WebAuthn authentication, returns auth token and device MLS keys. |
| `auth_keypackage` | MLS key package upload/lookup for group join. |
| `group_create`    | Creates a group on the server (groups, group_members, group_seq) so the creator can send messages. |
| `ds_send`        | WebSocket endpoint for message delivery (MLS ciphertext). |

- **Runtime**: Deno. HTTP via `serve()` from `deno.land/std`.
- **DB**: Supabase client with `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS).
- **CORS**: Handled in `_shared/cors.ts`; preflight and response headers set per request.

---

## Database (PostgreSQL / Supabase)

Main tables used by auth and messaging:

- **users** — `user_id` (PK, display name), `display_name`, `avatar_url`, `passkey_credential_id`, `passkey_public_key`.
- **devices** — `device_id` (PK), `user_id`, `mls_pk`, `mls_sk_enc` (encrypted MLS secret).
- **challenges** — `challenge_id`, `challenge`, `action` (`register`/`login`), TTL.
- **groups**, **group_members**, **group_seq**, **messages** — for MLS groups and message storage.

Schema is in `supabase/apply_schema.sql` (and migrations under `supabase/migrations/` if used).

---

## Message flow (how messages are sent and delivered)

All message traffic goes over a single WebSocket to the `ds_send` Edge Function. The **group id** used in the protocol and in the database is the **app group id** (UUID), e.g. from `group_create` or the group list. The MLS layer uses an internal group id (hex) only for encrypt/decrypt; the client must send the **UUID** to the server so it can look up `group_members` and store in `messages`.

### 1. Group creation (required before sending)

- Client creates an MLS group in WASM and calls `group_create` with `group_id` (UUID), `user_id`, `device_id`, `name`, etc.
- Server inserts into `groups`, `group_members` (with that `device_id`), and `group_seq` (initial sequence). Only then can this device send messages in that group.

### 2. Subscribe

- Client opens a WebSocket to `ds_send` and sends `{ type: "subscribe", user_id, device_id, groups: [group_id, ...], auth }`.
- Server checks `users` and `devices`, then subscribes the socket to Realtime channels for each `group_id`. All subsequent send/deliver use the same `group_id` (UUID).

### 3. Send message

- Client encrypts with MLS (using the MLS group state keyed by internal id) and calls DeliveryService `send({ groupId, senderId, deviceId, msgKind, mlsBytes, clientSeq })`. **`groupId` must be the app UUID**, not `mlsGroup.groupId` (hex).
- Over the wire: `{ type: "send", group_id, sender_id, device_id, msg_kind, mls_bytes, client_seq }`.
- Server (`ds_send`): verifies socket is authenticated and `sender_id`/`device_id` match; checks `group_members` for this `group_id` and `device_id`; calls RPC `send_message(p_group_id, p_sender_id, p_device_id, p_msg_kind, p_mls_bytes)` where sender/device ids are **device_id** (table `messages` references `devices(device_id)`).
- RPC `send_message`: increments `group_seq.last_server_seq` for that `group_id`, inserts into `messages`, returns `server_seq` and `server_time`.
- Server sends back `{ type: "ack", client_seq, server_seq, success: true }` and broadcasts `{ type: "deliver", group_id, server_seq, server_time, sender_id, device_id, msg_kind, mls_bytes }` on the group’s Realtime channel so other subscribers receive it.

### 4. Receive message

- Subscribed clients get the `deliver` payload on the WebSocket. They decrypt `mls_bytes` with their MLS group state and display the message. The sender usually does not process their own deliver (they already have the message from the ack).

### Summary

| Step        | Where        | group_id / id meaning                          |
|------------|--------------|-------------------------------------------------|
| group_create | Server       | UUID in `groups`, `group_members`, `group_seq` |
| subscribe  | Client → DS  | `groups`: list of UUIDs                         |
| send       | Client → DS  | `group_id`: UUID (same as in subscribe)        |
| send_message RPC | Server  | `p_group_id`: UUID                              |
| deliver    | DS → Client  | `group_id`: UUID                                |

MLS internal group id (hex from WASM) is used only inside the client for `encrypt`/`decrypt`; it is never sent to the server.

---

## Client

- **React** + **Vite**, **TypeScript**.
- **MLS**: Rust crate compiled to WASM (`client/src/mls/wasm`), OpenMLS-based. Keys and state in IndexedDB.
- **Auth**: Browser Web Authn API; calls to `auth_challenge`, `auth_register`, `auth_login`. No passwords.
- **Env**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (and optionally `VITE_WS_URL` for WebSocket). See `client/.env.example` if present.

---

## Deploy

- **Backend**: Deploy Edge Functions with Supabase CLI (`supabase functions deploy`) or Management API (`npx supabase functions deploy --use-api`). Apply DB schema first.
- **Frontend**: Build `client` and host the static output (e.g. Cloudflare Pages, or any static host). Set env at build time so `VITE_*` are correct for the deployed origin.

See [DEPLOY_STEPS_NOW.md](DEPLOY_STEPS_NOW.md) and [DEPLOY_MINIMUM_CHAT.md](DEPLOY_MINIMUM_CHAT.md) for step-by-step and architecture notes.
