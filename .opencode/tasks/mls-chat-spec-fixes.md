# MLS Chat Specification Fixes & New Specs

**Status:** READY_FOR_IMPLEMENTATION  
**Priority:** HIGH  
**Complexity:** MEDIUM (3 files to fix, 2 files to create, ~400 lines total)  
**Estimated Time:** 2-3 hours  

## Success Criteria

✅ All JSON code blocks properly formatted (```json...```)  
✅ Three spec files are mutually consistent  
✅ Two new spec files created with RFC 9750 & WebAuthn content  
✅ All cross-file references are valid  
✅ All files ready for `coder-mls-chat` agent to consume  

## Tasks (In Order)

### TASK 1: Fix `spec/auth_service.md`
**Status:** CRITICAL  
**Files affected:** 1  
**Lines changed:** ~80  

**What to do:**
- Close all JSON code blocks properly (```json...```)
- Add new endpoint: `POST /auth/challenge` with detailed explanation
- Add "Server validation" section (reference WebAuthn spec)
- Add reference to `spec/identity_and_passkeys.md`
- Fix formatting issues (lines 30-51)

**Acceptance:**
- [ ] `POST /auth/challenge` endpoint documented with request/response
- [ ] Challenge generation and TTL explained
- [ ] Server validation steps listed
- [ ] All JSON blocks closed properly

---

### TASK 2: Fix `spec/delivery_service.md`
**Status:** CRITICAL  
**Files affected:** 1  
**Lines changed:** ~100  

**What to do:**
- Close all JSON code blocks properly (```json...```)
- Add "Message Ordering Guarantees" section (RFC 9750 reference)
- Add "Commit Conflict Resolution" section
- Add "Message History & Offline Recovery" section
- Add "Out-of-Order Handling" section

**Acceptance:**
- [ ] All JSON blocks closed (```json...```)
- [ ] RFC 9750 references included (message ordering, Commit conflicts)
- [ ] Offline recovery explained with TTL and GET /messages endpoint
- [ ] File ready for RFC 9750 compliance

---

### TASK 3: Create new `spec/identity_and_passkeys.md`
**Status:** IMPORTANT  
**Files affected:** 1 (new file)  
**Lines:** ~150  

**What to do:**
1. Create new file at `spec/identity_and_passkeys.md`
2. Sections:
   - User ID Derivation (SHA256 hash of mls_public_key)
   - MLS Private Key Encryption (PRF-based, AES-256-GCM)
   - WebAuthn Challenge Flow (with server validation)
   - Multi-Device Support (device_id handling)
3. Include pseudocode for:
   - K_enc derivation using HKDF-SHA256
   - AES-256-GCM encryption/decryption
   - PRF output processing

**Acceptance:**
- [ ] User ID derivation explained with SHA256
- [ ] PRF encryption flow documented (client + server sides)
- [ ] WebAuthn challenge lifecycle explained
- [ ] Multi-device strategy documented

---

### TASK 4: Create new `spec/mls_integration.md`
**Status:** IMPORTANT  
**Files affected:** 1 (new file)  
**Lines:** ~120  

**What to do:**
1. Create new file at `spec/mls_integration.md`
2. Sections:
   - MLS Group Initialization
   - Creating a New Group
   - Adding Members (with Welcome messages, RFC 9750)
   - Message Processing Order (Proposal → Commit → App messages)
   - State Management (IndexedDB schema)
   - Encryption/Decryption Flow
   - Epoch Management
   - KeyPackage Lifecycle

**Acceptance:**
- [ ] Group initialization flow documented
- [ ] Member addition with Welcome explained
- [ ] IndexedDB schema for mls_state, mls_messages, pending_proposals
- [ ] Epoch management clarified (Forward Secrecy, PCS)

---

### TASK 5: Update `agent_system_prompt.md`
**Status:** MEDIUM  
**Files affected:** 1  
**Lines changed:** ~50  

**What to do:**
1. Add "MLS Security Properties" section (FS, PCS, Authentication)
2. Add "Welcome Messages" section (reference to RFC 9750)
3. Add "Device Management & Multi-Device Support" section
4. Add cross-references to new spec files

**Acceptance:**
- [ ] MLS security properties (FS, PCS) explained
- [ ] Welcome message lifecycle documented
- [ ] Device ID generation and management explained
- [ ] All new files referenced

---

## Task Dependencies

TASK 1 (auth_service.md) ↓ TASK 3 (identity_and_passkeys.md) ← references TASK 1 ↓ TASK 2 (delivery_service.md) [can run parallel to TASK 1] ↓ TASK 4 (mls_integration.md) [can run parallel to TASK 2] ↓ TASK 5 (agent_system_prompt.md) ← references all tasks


**Recommended order:** 1 → 3 → 2 → 4 → 5  
**Parallel execution OK:** (1, 2, 4) can start together, then 3, then 5

---

## Context for Coding Agent

**Key principles:**
- All files must be cloud-agnostic (no Supabase-specific details in spec/)
- MLS keys ONLY on client-side; servers never see plaintext
- RFC 9750[1][2] compliance for message ordering and Commit handling
- WebAuthn PRF for K_enc derivation (per WebAuthn spec)[10]

**Files NOT to touch:**
- `.opencode/agents/coder-mls-chat.md` (for agent only)
- `client/src/**` (TypeScript code - later phase)
- `backend/supabase/**` (backend code - later phase)

**Tools available:**
- `read`: Study `.github/copilot-instructions.md` if needed
- `agent`: Can delegate to other agents if needed (unlikely here)

---

## Verification Before Commit

- [ ] All ```json code blocks have opening + closing backticks
- [ ] No blank lines inside JSON examples
- [ ] All section headers (##, ###) properly formatted
- [ ] No trailing whitespace

**Consistency checks:**
- [ ] `user_id`, `auth_token`, `server_seq` used consistently
- [ ] All WebSocket messages have `type` field
- [ ] Cryptography described identically (K_enc, HKDF, AES-256-GCM)
- [ ] RFC 9750 references present where needed

---

## Next Phase (After This Task)

Once TASK 5 is complete, next phase will be:
- `.opencode/tasks/implement-auth-service.md` — TypeScript client code
- `.opencode/tasks/implement-delivery-service.md` — WebSocket adapter

But that's LATER. For now, focus only on specification completeness.
