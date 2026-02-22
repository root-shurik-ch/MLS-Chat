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
| Group & Invite API | Supabase Edge Functions (`group_create`, `group_join`, `group_delete`, `user_groups`, `group_members_list`, `invite_*`) |
| Database | Supabase Postgres (RLS disabled; service role key used in Edge Functions) |
| Client MLS | Rust/OpenMLS compiled to WASM (`client/src/mls/wasm/`), wrapped in `MlsClient` TypeScript class |
| Client State | IndexedDB (`MlsChatGroups` DB, version 4) |
