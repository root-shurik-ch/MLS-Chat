# Message Flow Audit Report: MLS-Chat
**Date**: February 2026

This report provides an audit of the entire message flow in the `MLS-Chat` repository, focusing on logic, security, and identifying overly complex areas that can be simplified.

## 1. Flow Overview
The message flow combines a traditional WebSocket broadcast system with Message Layer Security (MLS) for End-to-End Encryption (E2EE):
1.  **Send**: `Chat.tsx` encrypts the plaintext using the WASM `mlsClient`.
2.  **Transport**: The encrypted payload (`mlsBytes`) is sent to a Supabase Edge Function (`ds_send`) via WebSockets.
3.  **Sequencing**: `ds_send` verifies auth and group membership, then calls a Postgres function (`send_message`) which locks `group_seq` to assign a totally ordered `server_seq`.
4.  **Broadcast**: The ordered message is broadcast via Supabase Realtime channels to all subscribers.
5.  **Receive**: Connected clients receive the payload via `DeliveryServiceSupabase`, apply MLS commits if necessary, and use a critical section mutex (`mlsLock`) to decrypt the message sequentially.
6.  **Fallback Cache**: To solve multi-device and offline history synchronization—which is notoriously difficult in MLS—clients re-encrypt the decrypted plaintext with a user-specific static key (`kMsgCache`) and upload it to a server-side cache (`message_cache_sync`).

---

## 2. Security Analysis
Overall, the foundation is solid. The project correctly delegates E2EE to a WASM implementation of the MLS standard rather than rolling custom crypto.

*   ✅ **Server-Side Authorization**: The edge function `ds_send` correctly verifies `is_group_member` before broadcasting, preventing unauthorized users from polluting the group channel.
*   ✅ **Global Ordering**: Using a Postgres sequence (`group_seq` lock) ensures all clients see messages in the exact same chronological order. This is a strict requirement for MLS epoch progression.
*   ⚠️ **Compromised Forward Secrecy**: The "Fallback Cache" (`uploadMessageToCache`) fundamentally weakens the Forward Secrecy guarantees of MLS. By re-encrypting plaintext with a static, non-ratcheting `kMsgCache` and storing it on the server, an attacker who compromises `kMsgCache` (e.g., via device theft) can decrypt the entire conversation history from the server, negating the benefits of the MLS epoch ratcheting.

---

## 3. Complexity Bottlenecks & Simplification Proposals

The most problematic area of the codebase is `client/src/components/Chat/Chat.tsx`. It is a "God Component" (>1100 lines) handling UI, MLS cryptography, complex caching strategies, link fetching, file encryption, and WebSocket error recovery.

### Issue A: Concurrency Chaos in `Chat.tsx`
Because `onDeliver` (real-time WebSocket messages) and `loadHistory` (REST API bulk fetch) operate independently, they can race to process the same message or advance the MLS epoch simultaneously. This forces the use of a hacky Promise mutex (`mlsLock`) inside the React component.

**Simplification**:
*   **Abstract a `MessageSyncService`**: Move all MLS logic out of React. Create a singleton service that maintains a single, ordered incoming queue of messages.
*   Whether a message arrives via WebSocket or History Fetch, it is pushed to this queue.
*   A background worker processes the queue sequentially: `Decrypt -> Save to IndexedDB -> Update UI state`. This naturally eliminates race conditions without needing a complex UI-layer mutex (`runMlsOp`).

### Issue B: The Fallback Cache Logic
The `loadHistory` function is intensely complex. It checks IndexedDB first, then tries MLS decryption, catches `CannotDecryptOwnMessage` errors, fails over to the Server Cache API (`message_cache_sync`), decrypts that, and writes back to IndexedDB. 

**Simplification**:
*   **Drop the Server Plaintext Cache**: If possible, rely purely on MLS. Multi-device support in MLS is typically handled by adding each new device as a unique member of the MLS group (with its own `KeyPackage`), rather than sharing a symmetric key (`kMsgCache`) to decrypt a shadow copy of the database.
*   If the fallback cache *must* exist for MVP purposes, abstract the `fetchMessagesFromServerCache` and `uploadMessageToCache` logic into a separate `ChatStorageLayer`. The UI should simply call `storageLayer.getMessages()` and not care whether the data came from IndexedDB, MLS, or a server fallback.

### Issue C: Redundant WASM State Sync on Burst Commits ✅ Resolved
~~Currently, `saveAndSyncWasmState` is called manually in mapping loops within `Chat.tsx` after almost every message decryption or history load. Exporting and writing the entire MLS state tree to IndexedDB after every message is extremely computationally expensive and prone to state corruption if the user opens two tabs.~~

**Resolved (February 2026)**: The `onDeliver` commit handler in `Chat.tsx` now debounces `saveAndSyncWasmState` with an 800 ms trailing timer (`scheduleSave`). A burst of N rapid commits (e.g. multiple simultaneous member additions) produces exactly 1 IndexedDB write + 1 `sync_state` POST instead of N. On `useEffect` cleanup, `flushPendingSave()` fires synchronously so no state is lost on unmount. `loadHistory` was already correct — it calls `saveAndSyncWasmState` once at the end of the full batch.

---

## 4. Summary of Action Items
1.  **Refactor `Chat.tsx`**: Extract cryptography, queue management, and storage fallback logic into pure TypeScript services.
2.  **Queue Architecture**: Replace the `mlsLock` mutex with an Event Loop/Queue pattern in the new `MessageSyncService`.
3.  **Re-evaluate `kMsgCache`**: Understand that the secondary server cache weakens MLS security guarantees. Investigate treating secondary devices as independent MLS Group members.
