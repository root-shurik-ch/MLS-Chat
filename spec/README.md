# MLS Chat — Spec Index

This directory contains the authoritative specifications for the minimum.chat protocol and implementation.

---

## Document Map

### Protocol Specifications (public)

These documents define the cloud-agnostic protocol contracts. They are suitable for publication and can be used to implement alternative AS/DS backends.

| File | Contents |
|---|---|
| [`auth_service.md`](auth_service.md) | Authentication Service API (WebAuthn/passkey registration + login) |
| [`delivery_service.md`](delivery_service.md) | Delivery Service WebSocket protocol (subscribe, send, deliver, heartbeat) |
| [`group_management.md`](group_management.md) | Group + invite Edge Function API, DB schema, presence |
| [`identity_and_passkeys.md`](identity_and_passkeys.md) | User ID derivation, MLS key encryption, WebAuthn PRF flows |

### Implementation Documentation (internal)

These documents describe the specific Supabase/WASM implementation. They are authoritative for this codebase but are not part of the public protocol.

| File | Contents |
|---|---|
| [`mls_integration.md`](mls_integration.md) | WASM module internals, IndexedDB schema, state persistence, message flow |
| [`ui_design_system.md`](ui_design_system.md) | "Monochrome Security" design tokens, component library, UX patterns |
| [`agent_system_prompt.md`](agent_system_prompt.md) | Coding agent rules and architecture overview |

---

## Source of Truth Rule

Coding agents and contributors must treat `spec/*.md` as the source of truth for all protocols and data structures. When implementation diverges from spec, **update the spec first**, then update code.

---

## Current Implementation: Supabase

| Service | Implementation |
|---|---|
| Authentication Service (AS) | Supabase Edge Functions (`auth_challenge`, `auth_register`, `auth_login`, `auth_keypackage`) |
| Delivery Service (DS) | Supabase Edge Function (`ds_send`, WebSocket via Deno.upgradeWebSocket) |
| Group & Invite API | Supabase Edge Functions (`group_create`, `group_join`, `group_delete`, `user_groups`, `group_members_list`, `invite_create`, `invite_info`, `invite_join`, `invite_claim`, `invite_pending`, `invite_complete`, `invite_poll`) |
| Push Notifications | Supabase Edge Function (`push_register`); VAPID via `web-push`; service worker at `client/public/sw.js` |
| Database | Supabase Postgres (RLS disabled; service role key used in Edge Functions) |
| Client MLS | Rust/OpenMLS compiled to WASM (`client/src/mls/wasm/`), wrapped in `MlsClient` TypeScript class |
| Client State | IndexedDB (`MlsChatGroups` DB, version 4) |

## Implemented Features

| Feature | Status | Spec |
|---|---|---|
| WebAuthn passkey registration + login | Deployed | `auth_service.md` |
| Group create / join / delete | Deployed | `group_management.md` |
| Link-based invite flow | Deployed | `group_management.md` |
| Any-member invite processing with atomic claim | Deployed | `group_management.md` |
| Commit distribution (epoch synchronisation) | Deployed | `delivery_service.md`, `mls_integration.md` |
| Web Push Notifications (invite alerts) | Deployed | `group_management.md` |
| Group members panel with online presence | Deployed | `group_management.md` |
| Background pending-invite poll (30 s) | Deployed | `group_management.md` |
| MLS E2E encryption (chat messages) | Deployed | `mls_integration.md` |
| Message history replay | Deployed | `mls_integration.md` |
| Module-level MLS operation lock (serialize encrypt/decrypt/addMember) | Deployed | `mls_integration.md` |
| Subscribe idempotency & reconnect guard | Deployed | `delivery_service.md` |
| `clientSeq` persistence across reloads | Deployed | `mls_integration.md` |
| `get_messages` pagination (`limit` param) | Deployed | `delivery_service.md` |
