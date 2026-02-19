# MLS Integration

This document describes how MLS (Messaging Layer Security) is integrated into the client-side chat application. All MLS state and cryptography reside on the client; servers only handle ciphertext routing.

See RFC 9750 for the MLS protocol. See `identity_and_passkeys.md` for WebAuthn key management.

---

## WASM Module

**Location:** `client/src/mls/wasm/` (Rust, OpenMLS 0.7.3)
**Build:** `wasm-pack build --target web --out-dir pkg`
**TypeScript wrapper:** `client/src/mls/index.ts` (`MlsClient` class)

### Architecture: shared backend

A single `OpenMlsRustCrypto` backend is kept in a thread-local `BACKEND: RefCell<OpenMlsRustCrypto>` (in `src/provider.rs`). Every group operation borrows this backend, so all writes to `MemoryStorage` accumulate in one place. This is required for `MlsGroup::load(storage, group_id)` to work at restore time.

**Why not per-call fresh backend?** OpenMLS writes epoch secrets, message secrets, tree, etc. to the storage provider during every `MlsGroup::new`, `add_members`, `merge_pending_commit`, `create_message`, `process_message`. If the backend is discarded after each call, `MlsGroup::load` finds empty storage and fails.

### Signer

`SignatureKeyPair` is created once per WASM session (`get_or_create_signer` in `src/storage.rs`), serialized to JSON, and cached in thread-local `SIGNER_JSON`. It is included in `export_state` output so the same keypair is used across sessions — critical because the signer's public key is embedded in the group's leaf node (credential).

### Critical invariant: group is always restored

Functions that mutate an `MlsGroup` (encrypt, decrypt, add_member, apply_commit, create_update_proposal) use a `take_group` → operation → `store_group` pattern. `store_group` is always called, even on error, via a closure:

```rust
let mut group = take_group(&group_id).ok_or_else(|| ...)?;
let result = (|| -> Result<_, _> {
    // ... all operations that may fail
})();
store_group(group_id, group); // always runs
result
```

If `store_group` were skipped on error, the group would be permanently lost from the WASM `GROUPS` HashMap for the rest of the session.

---

## Cross-session State Persistence

### Export / Import

```
WASM: export_state() → JSON { storage: {hex_key: hex_val, ...}, signer: "..." }
TypeScript: saveWasmState(userId, json) → IndexedDB wasm_state store
```

```
IndexedDB: loadWasmState(userId) → json
WASM: import_state(json) → populates BACKEND.storage().values + SIGNER_JSON
WASM: load_group(group_id_hex) → MlsGroup::load(storage, group_id) → GROUPS map
```

### When state is saved

| Event | Where |
|---|---|
| Group created (`create_group`) | `App.tsx` `handleSelectGroup` |
| Group joined via invite (`process_welcome`) | `JoinGroup.tsx` |
| Invite generated (`add_member`) | `InviteLink.tsx` |
| Bulk history decrypted | `Chat.tsx` `loadHistory` effect |

State is NOT saved after individual encrypt/decrypt in real-time chat (performance). The ratchet position after the last history load is the restore point.

### Restore on startup

In `App.tsx` `initializeServices`:
1. `loadWasmState(userId)` → IndexedDB
2. `mlsClient.importState(stateJson)` → restores backend storage + signer
3. For each group in `loadAllMlsGroups()`: `mlsClient.loadGroup(stored.groupId, stored.id)` → restores WASM group into session

---

## IndexedDB Schema

Database: `MlsChatGroups`, version **3**

| Store | Key (keyPath) | Fields | Notes |
|---|---|---|---|
| `groups` | `id` (app UUID) | `id`, `groupId` (MLS hex), `epoch`, `treeHash`, `epochAuthenticator`, `lastUpdated` | Group metadata; `id` = app UUID used throughout the app; `groupId` = internal MLS group ID hex used for WASM calls |
| `wasm_state` | `userId` | `userId`, `stateJson`, `lastUpdated` | Full serialized WASM state; one record per user |

**Migration history:**
- v1 → v2: `groups` store keyPath changed from `'groupId'` to `'id'` (store dropped and recreated)
- v2 → v3: `wasm_state` store added

---

## Group ID Mapping

Two group IDs coexist and must not be confused:

| ID | Type | Used in | Source |
|---|---|---|---|
| App UUID (`group.id`) | UUID string | Database, WebSocket protocol, IndexedDB key | `group_create` Edge Function or passed to `createGroup()` |
| MLS group ID (`group.groupId`) | Hex string | WASM calls only: `encrypt`, `decrypt`, `add_member`, `load_group` | Returned by OpenMLS `MlsGroup::group_id()` |

The server never sees the MLS hex ID. All DS/DB operations use the app UUID.

---

## Database Tables (MLS-related)

### devices
- `device_id` (text, PK): Unique device identifier.
- `user_id` (text, FK): Associated user.
- `mls_pk` (text): MLS public key (base64).
- `mls_sk_enc` (text): Encrypted MLS private key (base64).

Each device has its own MLS identity keypair, enabling multi-device support.

### groups / group_members / group_seq / messages

See `supabase/apply_schema.sql` for the authoritative schema.

---

## Message Flow

### Creating a Group

1. Client calls `mlsClient.createGroup(appGroupUuid)` → WASM creates MLS group, writes to shared backend; returns `{ id, groupId, epoch, ... }`.
2. Client calls `group_create` Edge Function with the app UUID, `user_id`, `device_id`.
3. Client calls `export_state()` and saves to IndexedDB.

### Inviting a Member

1. Inviting client: `mlsClient.generateKeyPackage()` → temporary KeyPackage.
2. `mlsClient.addMember(group, keyPackage)` → Commit + Welcome; epoch advances.
3. Share JSON `{ groupId: appUuid, welcome: welcomeHex }` out-of-band.
4. Inviting client calls `export_state()` and saves to IndexedDB.

### Joining via Welcome

1. Joiner parses the invite code → extracts `groupId` (app UUID) and `welcome` (hex).
2. `mlsClient.generateKeyPackage()` to generate own KeyPackage.
3. `mlsClient.processWelcome(welcomeHex, keyPackage)` → WASM processes Welcome, returns `{ groupId: mlsHex, ... }`.
4. Client calls `group_join` Edge Function to register as member.
5. `saveMlsGroup({ id: appUuid, groupId: mlsHex, ... })` → IndexedDB.
6. `export_state()` + `saveWasmState()` → IndexedDB.

### Sending a Message

1. `mlsClient.encryptMessage(group, plaintext)` → ciphertext hex (message secrets update in shared backend).
2. `deliveryService.send({ groupId: appUuid, mlsBytes: ciphertext, ... })` → WebSocket.

### Receiving a Message

1. `deliveryService.onDeliver(msg)` → `mlsClient.decryptMessage(group, msg.mlsBytes)` → plaintext (ratchet advances in shared backend).

### Loading History

1. `GET /functions/v1/get_messages` with `{ group_id, user_id, device_id }`.
2. For each message: `mlsClient.decryptMessage(group, m.mls_bytes)`.
3. Failed decryptions (e.g. messages from before this device joined) are silently skipped.
4. After successful batch: `export_state()` + `saveWasmState()` to checkpoint the ratchet position.

---

## Epoch Management

Each Commit advances the MLS epoch:
- Add member → new epoch
- Update proposal + Commit → new epoch (forward secrecy)
- Remove member → new epoch

The epoch is stored in `groups.epoch` (metadata only) and fully in the WASM backend (the source of truth). After a page reload, the persisted epoch is restored via `import_state` + `load_group`.

Messages encrypted in epoch N can only be decrypted by a client whose ratchet is at epoch N. Messages from epochs before the last persisted checkpoint cannot be re-decrypted — they should be cached decrypted in the client (future work: `mls_messages` IndexedDB store).
