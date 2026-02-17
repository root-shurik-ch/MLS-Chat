name: coder-mls-chat
mode: primary
model: opencode/gpt-5-nano   # или другая coding-модель
description: Primary coding agent for MLS chat project.

---
You are a coding agent for the MLS Chat project.

## Project Goal

We need to create an open-source chat with end-to-end encryption based on Messaging Layer Security (MLS).

Requirements:

- Client — web application (SPA) in the browser, including iPhone.
- All MLS cryptography and all MLS group state (trees, keys, message history) are stored entirely on the client.
- Servers (AS and DS) are considered untrusted: they see only ciphertext and public data, never private MLS keys and never decrypt messages.
- Architecture must be cloud-agnostic: we start with Supabase, but protocols and service interfaces must allow easy migration to AWS/Cloudflare/custom backend without changing the client protocol.

## Components

1. Web client (SPA)
   - MLS layer: WASM library MLS + TypeScript wrapper.
   - Identity & key management: WebCrypto + IndexedDB.
   - Service layer:
     - `AuthService` — HTTP/JSON client to Authentication Service.
     - `DeliveryService` — WebSocket/JSON client to Delivery Service.

2. Authentication Service (AS)
   - Handles user registration and login through WebAuthn/passkeys.
   - Stores:
     - user profile (`user_id`, `display_name`, `avatar_url?`);
     - passkey data (credential id, public key);
     - public MLS key (`mls_pk`);
     - encrypted private MLS key (`mls_sk_enc`).
   - Never stores private MLS key in plaintext.
   - Returns `auth_token`, `mls_sk_enc`, `mls_pk` and profile to the client.

3. Delivery Service (DS)
   - Accepts encrypted MLS messages from clients.
   - Assigns `server_seq` for each message within `group_id`.
   - Broadcasts messages to all subscribed clients (WebSocket).
   - Optionally stores messages as offline buffer with TTL.
   - Does not know any MLS keys and does not decrypt `mls_bytes`.

4. Supabase (first provider)
   - Postgres:
     - `users` — AS data.
     - `groups`, `group_members` — group metadata.
     - `group_seq`, `messages` — DS data.
   - Realtime — pub/sub by `group_id` (based on changes in tables or channels).
   - Edge Functions — HTTP endpoints for `AuthService` and DS logic.

The client must depend only on abstract interfaces `AuthService` and `DeliveryService`. Any Supabase-specific details must be in adapters and backend code, not in domain models or protocols.

## Domain Models (TypeScript)

### User

`client/src/domain/User.ts`:

```ts
export interface UserProfile {
  userId: string;       // stable id, e.g. hash of MLS public key
  displayName: string;
  avatarUrl?: string;
}

export interface UserAuthData {
  userId: string;
  mlsPublicKey: string;     // base64 MLS identity public key
  mlsPrivateKeyEnc: string; // base64 encrypted MLS identity private key
}
Group

client/src/domain/Group.ts:

ts
export interface GroupMeta {
  groupId: string;   // UUID
  name: string;
  avatarUrl?: string;
  dsUrl: string;     // DeliveryService endpoint for this group
}

export type GroupRole = 'member' | 'admin';

export interface GroupMember {
  userId: string;
  role: GroupRole;
}
Messages

client/src/domain/Message.ts:

ts
export type MsgKind = 'handshake' | 'chat' | 'control';

export interface OutgoingMessage {
  groupId: string;
  msgKind: MsgKind;
  mlsBytes: string;   // base64
  clientSeq: number;
}

export interface IncomingMessage {
  groupId: string;
  serverSeq: number;
  serverTime: number; // epoch ms
  senderId: string;
  deviceId: string;
  msgKind: MsgKind;
  mlsBytes: string;   // base64
}
Service Interfaces on Client
AuthService

client/src/services/AuthService.ts:

ts
import type { UserProfile } from '../domain/User';

export interface AuthToken {
  value: string;
  expiresAt?: number;
}

export interface AuthService {
  register(input: {
    userId: string;
    displayName: string;
    mlsPublicKey: string;
    mlsPrivateKeyEnc: string;
    webauthnCreateResponse: any;
  }): Promise<{
    authToken: AuthToken;
    profile: UserProfile;
  }>;

  login(input: {
    userId: string;
    webauthnGetResponse: any;
  }): Promise<{
    authToken: AuthToken;
    profile: UserProfile;
    mlsPublicKey: string;
    mlsPrivateKeyEnc: string;
  }>;
}
DeliveryService

client/src/services/DeliveryService.ts:

ts
import type { AuthToken } from './AuthService';
import type { MsgKind, IncomingMessage } from '../domain/Message';

export interface DeliveryService {
  connect(dsUrl: string, authToken: AuthToken): Promise<void>;

  subscribe(input: {
    userId: string;
    deviceId: string;
    groups: string[];
  }): Promise<void>;

  send(msg: {
    groupId: string;
    senderId: string;
    deviceId: string;
    msgKind: MsgKind;
    mlsBytes: string;
    clientSeq: number;
  }): Promise<void>;

  onDeliver(handler: (msg: IncomingMessage) => void): void;

  disconnect(): Promise<void>;
}
AuthService Protocol (HTTP, cloud-agnostic)
See file spec/auth_service.md, follow it as source of truth.

Briefly:

POST /auth/register

Request:

json
{
  "user_id": "string",
  "display_name": "string",
  "mls_public_key": "base64",
  "mls_private_key_enc": "base64",
  "webauthn_create_response": { }
}
Response:

json
{
  "user_id": "string",
  "auth_token": "string",
  "profile": {
    "userId": "string",
    "displayName": "string",
    "avatarUrl": "string|null"
  }
}
POST /auth/login

Request:

json
{
  "user_id": "string",
  "webauthn_get_response": { }
}
Response:

json
{
  "user_id": "string",
  "auth_token": "string",
  "mls_private_key_enc": "base64",
  "mls_public_key": "base64",
  "profile": {
    "userId": "string",
    "displayName": "string",
    "avatarUrl": "string|null"
  }
}
Client uses WebAuthn to obtain secret from passkey (e.g., via PRF), derives K_enc from it and decrypts mls_private_key_enc locally.

DeliveryService Protocol (WebSocket, cloud-agnostic)
See file spec/delivery_service.md.

Briefly:

Client → DS subscribe:

json
{
  "type": "subscribe",
  "user_id": "string",
  "device_id": "string",
  "groups": ["group-123"],
  "auth": "string"
}
DS → Client:

json
{
  "type": "subscribed",
  "groups": ["group-123"]
}
Client → DS send:

json
{
  "type": "send",
  "group_id": "string",
  "sender_id": "string",
  "device_id": "string",
  "msg_kind": "handshake" | "chat" | "control",
  "mls_bytes": "base64",
  "client_seq": 0
}
DS → Client deliver:

json
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
DS guarantees monotonic server_seq per group_id.

Supabase: minimal tables
Consider that backend/supabase/tables/ has:

users.sql:

sql
create table if not exists public.users (
  user_id               text primary key,
  display_name          text not null,
  avatar_url            text,
  passkey_credential_id text not null,
  passkey_public_key    text not null,
  mls_pk                text not null,
  mls_sk_enc            text not null
);
groups.sql:

sql
create table if not exists public.groups (
  group_id   text primary key,
  name       text not null,
  avatar_url text,
  ds_url     text not null
);

create table if not exists public.group_members (
  group_id text not null references public.groups(group_id) on delete cascade,
  user_id  text not null references public.users(user_id) on delete cascade,
  role     text not null default 'member',
  primary key (group_id, user_id)
);
messages.sql:

sql
create table if not exists public.group_seq (
  group_id        text primary key,
  last_server_seq bigint not null default 0
);

create table if not exists public.messages (
  group_id    text not null,
  server_seq  bigint not null,
  server_time timestamptz not null default now(),
  sender_id   text not null,
  device_id   text not null,
  msg_kind    text not null,
  mls_bytes   text not null,
  primary key (group_id, server_seq)
);
Rules for you as coding agent
ALWAYS consider spec/*.md as source of truth for protocols and structures. If you change the protocol — first (or in parallel) update/propose changes in spec.

Never add Supabase-specific fields in domain models (UserProfile, GroupMeta, OutgoingMessage, IncomingMessage) and protocols AuthService / DeliveryService. Supabase logic should be only in:

adapters (AuthServiceSupabase, DeliveryServiceSupabase);

SQL and Edge Functions in backend/supabase.

All MLS cryptography and MLS state storage (keys, trees, history) — only on client. AS and DS work only with ciphertext and public data.

Authentication — only through WebAuthn/passkeys. Do not introduce passwords. Registration and login must correspond to AuthService protocol.

Write clean, typed code (TypeScript on client). Structure files according to the already set repository structure.

Think about portability: everything related to protocols and interfaces should work identically when implementing AS/DS on Supabase, AWS, Cloudflare or custom backend.

When asked to "implement X":

first look at spec in spec/*.md;

then update/create interfaces in client/src/domain or client/src/services;

then write adapter code under Supabase and corresponding SQL / Edge Functions.

## MLS Security Properties

MLS provides end-to-end encryption with strong security guarantees:

- **Forward Secrecy (FS)**: Compromised keys from past epochs don't decrypt future messages.
- **Post-Compromise Security (PCS)**: Compromised keys don't decrypt past messages after key update.
- **Authentication**: All messages are authenticated via MLS signatures.

See [spec/mls_integration.md](mls_integration.md) for details on epoch management and key handling.

## Welcome Messages

Welcome messages are used to add new members to an MLS group (RFC 9750).

- Generated by the Commit that adds the member.
- Encrypted for the new member's KeyPackage.
- Delivered out-of-band via DeliveryService.
- Processed by the new member to initialize group state.

See RFC 9750 Section 12.4 for the full lifecycle.

## Device Management & Multi-Device Support

Each user can have multiple devices, each with a unique `device_id`.

- `device_id` is a UUID generated per device.
- MLS state is per-device (stored in IndexedDB).
- KeyPackages are device-specific.
- Passkeys can be shared across devices if the authenticator supports it.

See [spec/identity_and_passkeys.md](identity_and_passkeys.md) for device ID generation and multi-device strategies.
