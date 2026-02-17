# Final Implementation Plan for MLS Chat MVP

## Phase Overview

This phase represents the final implementation of the MLS Chat MVP — an open-source chat with end-to-end encryption based on Messaging Layer Security (MLS). The MVP includes:

- Web client (SPA) with support for browsers, including iPhone.
- Authentication Service (AS) for registration and login via WebAuthn.
- Delivery Service (DS) for delivery of encrypted messages.
- Initial implementation on Supabase with cloud-agnostic architecture.

The goal: Deliver a functional MVP where users can register, create groups, send and receive encrypted messages, with full control of cryptography on the client.

## Tasks

### High Priority

1. **Implement MLS Layer in WASM**
   - **Description**: Create a WASM library based on MLS for the client, including a TypeScript wrapper. Ensure storage of all MLS state (trees, keys, history) on the client in IndexedDB.
   - **Acceptance Criteria**:
     - MLS operations (key exchange, encryption/decryption) work in the browser.
     - State is saved locally and restored on reload.
     - Integration with WebCrypto for additional keys.
   - **Dependencies**: Access to MLS specifications and WASM toolchain.

2. **Web Client UI and Core Logic**
   - **Description**: Develop an SPA on React/Vue with components for registration, login, group list, chat, group management.
   - **Acceptance Criteria**:
     - UI is adaptive for mobile devices (including iPhone).
     - WebAuthn support is mandatory; error if not supported.
     - Messages are displayed with real-time decryption.
     - Client depends only on abstract interfaces AuthService and DeliveryService.

3. **Authentication Service (AS) on Supabase**
   - **Description**: Implement AS as a Supabase Edge Function. Store user profiles, passkey data, public MLS keys, and encrypted private MLS keys.
   - **Acceptance Criteria**:
     - Registration and login via WebAuthn API.
     - Never stores MLS private keys in plaintext.
     - Corresponds to the protocol from spec/auth_service.md.
     - WebAuthn is mandatory: hardware keys, Android biometric, iOS Face ID/Touch ID.
     - Target browsers: Chrome 67+, Firefox 60+, Safari 14+, Edge 18+.
     - If the browser does not support — show error: "WebAuthn required. Update browser or use compatible device."

4. **Delivery Service (DS) on Supabase**
   - **Description**: Implement DS as Supabase Realtime/WebSocket. Accept and broadcast encrypted MLS messages, assign server_seq.
   - **Acceptance Criteria**:
     - WebSocket connection with authentication.
     - Monotonic server_seq per group_id.
     - Does not decrypt mls_bytes.
     - Corresponds to the protocol from spec/delivery_service.md.

5. **WebAuthn and Key Management Integration**
   - **Description**: Integrate WebAuthn in the client for passkey generation and usage. Use PRF to derive K_enc from passkey secret for mls_private_key_enc decryption.
   - **Acceptance Criteria**:
     - No fallback to passwords — WebAuthn is mandatory.
     - Support for all types: hardware keys, biometric.
     - Error if navigator.credentials is not supported.

### Medium Priority

6. **Supabase Tables and Schema**
   - **Description**: Create and configure tables: users, groups, group_members, messages, group_seq.
   - **Acceptance Criteria**: Schema corresponds to specifications, with RLS policies for security.

7. **E2E Testing and Security Audit**
   - **Description**: Write tests for encryption, authentication, message delivery.
   - **Acceptance Criteria**: All tests pass; audit confirms E2E encryption without leaks.

### Low Priority

8. **Documentation and Deployment**
   - **Description**: Update README, spec files; set up CI/CD for deployment on Vercel/Netlify.
   - **Acceptance Criteria**: Project is ready for open-source release.

## Dependencies

- Completed specifications in spec/*.md.
- Access to Supabase project.
- WASM toolchain (Emscripten or similar).
- MLS reference implementation (e.g., openmls).
- Browsers for testing.

## Success Criteria

- Users can register/login via WebAuthn.
- Create groups and invite participants.
- Send and receive messages with end-to-end encryption.
- All cryptography on the client; servers see only ciphertext.
- MVP works in target browsers without errors.

## Resources

- Developers: 2-3 full-stack devs with experience in TypeScript, React, WASM, Supabase.
- Tools: Node.js, Rust (for WASM), Supabase CLI, GitHub.
- Time: 4-6 weeks for the phase.

## Risks

- **WebAuthn Support**: If the user's browser does not support WebAuthn (old versions), show a clear error with instructions to update or use a compatible device. Risk: Users on outdated browsers; Mitigation: Target modern browsers, fallback error.
- **MLS Complexity**: Implementing MLS in WASM may be complex; Mitigation: Use existing libraries.
- **Security Leaks**: Improper key handling; Mitigation: Code review and audit.
- **Performance**: Encryption in the browser on mobile; Mitigation: Optimize WASM.
- **Supabase Limits**: Free tier is limited; Mitigation: Monitor usage, plan for upgrade.