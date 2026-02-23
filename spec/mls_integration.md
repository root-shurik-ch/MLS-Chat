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
| Group joined via invite (`process_welcome`) | `InviteJoinView.tsx` |
| Invite generated (`add_member`) | `InviteLink.tsx` and `App.tsx` `processPendingInvites` (only after successful `invite_complete`) |
| Commit applied (`applyCommit`) | `Chat.tsx` `onDeliver` handler (real-time) |
| Bulk history decrypted | `Chat.tsx` `loadHistory` effect |

State is NOT saved after individual encrypt/decrypt in real-time chat (performance). The ratchet position after the last history load is the restore point.

---

## MLS Operation Serialization

All WASM mutations share a single module-level promise-chain lock defined in `client/src/utils/mlsLock.ts`:

```typescript
let _lock: Promise<void> = Promise.resolve();

export function runMlsOp<T>(fn: () => Promise<T>): Promise<T> {
  const next = _lock.then(fn, fn) as Promise<T>;
  _lock = next.then(() => {}, () => {});
  return next;
}
```

**Why module-level:** `Chat.tsx` and `App.tsx` are separate React component trees with no shared state. A `useRef`-based lock in `Chat.tsx` is invisible to `App.tsx`'s `processPendingInvites`. The module-level singleton is the only reliable serialization point.

**What is wrapped:**

| Operation | Location |
|---|---|
| `decryptMessage` | `Chat.tsx` `loadHistory` and `onDeliver` (with cache re-check inside lock) |
| `applyCommit` | `Chat.tsx` `loadHistory` and `onDeliver` |
| `encryptMessage` | `Chat.tsx` `handleSend` and `handleFileSelect` |
| `loadGroup` + `importState` + `addMember` + `exportState` + `saveAndSyncWasmState` | `App.tsx` `processPendingInvites` (entire per-invite MLS block in one `runMlsOp` call) |

**Why `encryptMessage` must be inside the lock:** MLS encrypt advances the sender's ratchet. If `encryptMessage` runs concurrently with an incoming `decryptMessage` (e.g. the user sends while an offline batch is being replayed), the WASM shared backend can be left in a corrupt state, producing `SecretReuseError` or `TooDistantInThePast` on subsequent decryptions.

**Important:** In `processPendingInvites`, WASM state is saved only after `invite_complete` returns successfully. If `invite_complete` fails, the WASM epoch must not be persisted — doing so would leave the WASM at epoch N+1 with no server record of the Welcome, causing the next retry to attempt `addMember` on an already-consumed KeyPackage.

### Restore on startup

In `App.tsx` `initializeServices`:
1. `loadWasmState(userId)` → IndexedDB
2. `mlsClient.importState(stateJson)` → restores backend storage + signer
3. For each group in `loadAllMlsGroups()`: `mlsClient.loadGroup(stored.groupId, stored.id)` → restores WASM group into session

---

## IndexedDB Schema

Database: `MlsChatGroups`, version **4**

| Store | Key (keyPath) | Fields | Notes |
|---|---|---|---|
| `groups` | `id` (app UUID) | `id`, `groupId` (MLS hex), `epoch`, `treeHash`, `epochAuthenticator`, `lastUpdated` | Group metadata; `id` = app UUID used throughout the app; `groupId` = internal MLS group ID hex used for WASM calls |
| `wasm_state` | `userId` | `userId`, `stateJson`, `lastUpdated` | Full serialized WASM state; one record per user |
| `sent_messages` | `id` (`groupId:serverSeq`) | `id`, `groupId`, `serverSeq`, `text`, `senderId`, `deviceId`, `timestamp` | Plaintext cache of sent messages (MLS senders cannot re-decrypt own ciphertext from history) |

**Migration history:**
- v1 → v2: `groups` store keyPath changed from `'groupId'` to `'id'` (store dropped and recreated)
- v2 → v3: `wasm_state` store added
- v3 → v4: `sent_messages` store added

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

### Inviting a Member (link-based flow)

The invite flow is server-mediated — no manual hex copy-paste. E2E encryption is preserved: the server stores only public KP bytes and the encrypted Welcome.

1. **Any group member** calls `invite_create` Edge Function → receives `invite_id`.
2. Constructs shareable URL: `https://app/?join=<invite_id>` and shares it (chat, email, etc.).
3. **Joiner** opens the URL, logs in, and sees `InviteJoinView`.
4. Joiner calls `mlsClient.generateKeyPackage()` → submits `kp_hex` via `invite_join` Edge Function. Server fires a push notification to all group members.
5. **Any group member's app** polls `invite_pending` every 5 s (via `InviteLink` component) or every 30 s (via `processPendingInvites` background poll).
6. When a KP is found: calls `invite_claim` — skips if another member holds the claim.
7. If claimed: `mlsClient.addMember(group, kp)` → returns `{ welcome: string, commit: string }`; epoch advances to N+1 locally (WASM auto-applies via `merge_pending_commit`).
8. Processor calls `invite_complete(invite_id, welcome_hex, commit_hex)`.
   - Server stores `welcome_hex` and `commit_hex` on the invite record.
   - Server inserts a `msg_kind: 'commit'` message into the group log via `send_message` RPC.
   - Server broadcasts the commit via Supabase Realtime (best-effort).
9. Processor calls `export_state()` and saves to IndexedDB (only on success).
10. **Joiner** polls `invite_poll` every 3 s; when `welcome_hex` arrives → `processWelcome` → join complete (joiner is at epoch N+1 directly).
11. **Other existing members** receive the `commit` message via DS and call `applyCommit` to advance from N → N+1.

### Joining via Welcome

1. Joiner receives `welcome_hex` from `invite_poll` response (contains `{ status: 'complete', welcome_hex, group_id }`).
2. `mlsClient.processWelcome(welcomeHex)` → WASM processes Welcome, returns `{ groupId: mlsHex, ... }`.
3. Client calls `group_join` Edge Function to register as member on the server.
4. `saveMlsGroup({ id: appUuid, groupId: mlsHex, ... })` → IndexedDB.
5. `export_state()` + `saveWasmState()` → IndexedDB.

### Sending a Message

1. `runMlsOp(() => mlsClient.encryptMessage(group, plaintext))` → ciphertext hex inside the shared MLS lock (ratchet advances in shared backend; lock prevents concurrent decrypt from corrupting state).
2. `deliveryService.send({ groupId: appUuid, mlsBytes: ciphertext, clientSeq, ... })` → WebSocket.

**`clientSeq` persistence:** Each device persists the next `clientSeq` to `localStorage` keyed by `groupId` (`min:clientSeq:<groupId>`). This ensures that after a page reload the counter resumes from its last position, preventing collision between retry acks for queued offline messages and new messages starting at 1.

### Receiving a Commit (`msg_kind: 'commit'`)

When the DS delivers a message with `msg_kind === 'commit'` (either real-time or via history replay):

1. `mlsClient.applyCommit(mlsGroup, { proposals: [], commit: msg.mlsBytes, epochAuthenticator: '' })` — advances the WASM group from epoch N to N+1.
2. `export_state()` + `saveAndSyncWasmState()` — persists the new epoch to IndexedDB.
3. The message is never added to the chat message list.

Failed `applyCommit` calls (e.g. the joiner's own client receiving a commit it already processed via `processWelcome`) are silently swallowed. History replay applies commits in `server_seq` ASC order, ensuring all epoch advances precede any messages at the new epoch.

### Receiving a Message

1. `deliveryService.onDeliver(msg)` → `mlsClient.decryptMessage(group, msg.mlsBytes)` → plaintext (ratchet advances in shared backend).

### Loading History

1. `POST /functions/v1/get_messages` with `{ group_id, user_id, device_id, since_seq?, limit? }`.
   - On reconnect pass `since_seq: maxSeqRef.current` to fetch only messages missed during the outage.
   - Default `limit` is 200; can be overridden by the caller (server caps at 1000).
2. Commits (`msg_kind === 'commit'`) are applied first via `runMlsOp(() => mlsClient.applyCommit(...))` to advance epoch before decrypting application messages.
3. For each chat message: check IndexedDB cache → if miss, `runMlsOp(async () => { getCachedMessage(); decryptMessage(); saveSentMessage(); })` (cache re-check inside lock prevents duplicate decryption when `onDeliver` races with `loadHistory`).
4. Failed decryptions fall back to server-side message cache (`message_cache_sync`), then are silently skipped if unrecoverable.
5. After successful batch: `export_state()` + `saveAndSyncWasmState()` to checkpoint the ratchet position.

---

## Epoch Management

Each Commit advances the MLS epoch:
- Add member → new epoch
- Update proposal + Commit → new epoch (forward secrecy)
- Remove member → new epoch

The epoch is stored in `groups.epoch` (metadata only) and fully in the WASM backend (the source of truth). After a page reload, the persisted epoch is restored via `import_state` + `load_group`.

Messages encrypted in epoch N can only be decrypted by a client whose ratchet is at epoch N. Messages from epochs before the last persisted checkpoint cannot be re-decrypted — they should be cached decrypted in the client (future work: `mls_messages` IndexedDB store).

---

## MLS Invariants: add_member / process_welcome / applyCommit

These invariants must be respected to maintain epoch consistency across all group members.

### `add_member(group, kp)` — the processor

- WASM `add_member` internally calls `merge_pending_commit` before returning. The **processor is already at epoch N+1** when `addMember` returns.
- Returns `{ welcome: hex, commit: hex }`.
- The processor must NOT call `applyCommit` on the commit it just created — it would double-advance the epoch.

### `process_welcome(welcome_hex)` — the joiner

- WASM `process_welcome` brings the joiner directly to **epoch N+1**.
- The joiner must NOT call `applyCommit` on the same commit. The commit message in the DS is intended only for existing members who were at epoch N and did not participate in the add.

### `applyCommit(commitHex)` — existing members (neither processor nor joiner)

- Every other existing group member (group size > 2 case) must call `applyCommit` exactly once per Commit to advance from epoch N to N+1.
- Calling `applyCommit` on a commit that has already been applied (e.g. the joiner receiving a commit for its own Welcome) produces an error; this is silently swallowed.
- `applyCommit` must be called in `server_seq` order to avoid processing a message at epoch N+1 while still at epoch N.

### Solo / 2-member groups

When the processor is the only existing member before the add (a 2-person group being formed), there are no other members to receive the commit. `invite_complete` still stores the commit message in the DS log, but no existing member will consume it. This is safe — the joiner ignores it via `processWelcome`, and the processor already applied it via `addMember`.

### Concurrency: one active invite per group

Two simultaneous pending invites for the same group are not safe to process in parallel — each `addMember` call would produce conflicting commits. The `invite_claim` mechanism serialises processing (one claim holder at a time per invite), and the UI limits display to one active invite per group.
