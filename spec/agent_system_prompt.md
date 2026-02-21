# MLS Chat – System Prompt for Coding Agent

## Project goal
Build an open source, end‑to‑end encrypted chat system based on Messaging Layer Security (MLS).  
Clients are web applications (including iPhone Safari). All MLS state (group trees, keys, message history) is stored client‑side. Servers are minimal and untrusted: they only route ciphertext and never see plaintext or MLS private keys.

**UI/UX Principle:** "Minimum" is literal. We use a strict monochrome, minimalist design that emphasizes security and typography.

## Tech Stack
- **Frontend:** React + Vite
- **Styling:** Tailwind CSS
- **Icons:** Lucide React
- **Primitives:** Radix UI
- **Cryptography:** MLS core via WASM + TypeScript wrapper.
- **Identity:** WebCrypto + IndexedDB + WebAuthn/Passkeys.

## High‑level architecture
The architecture must be cloud‑agnostic. We start with Supabase as the first provider but keep AS (Authentication Service) and DS (Delivery Service) as abstract services that can be re‑implemented on AWS, Cloudflare, or custom servers without changing the client‑side protocol.

Components:
- **Web client (SPA):**
  - UI: Strict monochrome, minimalist React application.
  - MLS core via WASM + TypeScript wrapper.
  - Identity & key management (WebCrypto + IndexedDB).
  - Service layer (`AuthService`, `DeliveryService` interfaces).
- **Authentication Service (AS):**
  - Handles user registration and login via WebAuthn/passkeys.
  - Stores user profile, MLS public keys, and `mls_sk_enc`.
- **Delivery Service (DS):**
  - Stateless router for encrypted MLS messages.
  - Assigns `server_seq` and delivers via WebSockets.

## UI/UX & Design System
Follow `spec/ui_design_system.md` for all UI development.
- **Monochrome:** Background `#000000`, Text `#FFFFFF`. Use opacity for hierarchy.
- **No Bubbles:** Messages are a clean list, terminal-style.
- **Files:** Support up to 100MB. Display as "Encrypted File" with lock icon.
- **Security:** Visual indicators for device verification and MLS epoch changes (system messages).

## Core domain models
See TypeScript definitions in:
- `client/src/domain/User.ts`
- `client/src/domain/Group.ts`
- `client/src/domain/Message.ts`

## AuthService protocol (cloud‑agnostic)
Logical HTTP API (implemented first on Supabase via Edge Functions). See `spec/auth_service.md`.

## DeliveryService protocol (cloud‑agnostic)
Logical WebSocket protocol. See `spec/delivery_service.md`.

## Rules for this coding agent
1. **Source of Truth:** Always treat `spec/*.md` as the source of truth for protocols and data structures.
2. **UI Consistency:** All UI must adhere to the monochrome minimalist style defined in `spec/ui_design_system.md`.
3. **Files:** Limit file uploads to 100MB. Ensure files are encrypted client-side before upload.
4. **Cloud-Agnostic:** Never introduce Supabase‑specific details into domain models or protocol structures.
5. **Security:** All MLS cryptography and MLS state must stay client‑side. No passwords, only Passkeys/WebAuthn.
6. **Implementation Flow:**
   - Check relevant spec in `spec/`.
   - Implement/modify TypeScript interfaces in `client/src/domain` or `client/src/services`.
   - Implement UI components using Tailwind and Radix.
   - Implement Supabase adapters in `client/src/services/*Supabase.ts` and backend code under `backend/supabase/`.
