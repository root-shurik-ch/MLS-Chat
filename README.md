# MLS-Chat

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Build Status](https://img.shields.io/github/actions/workflow/status/your-org/mls-chat/ci.yml)](https://github.com/your-org/mls-chat/actions)

MLS-Chat is an open-source, end-to-end encrypted chat app built with Messaging Layer Security (MLS). Features WebAuthn/passkey authentication, multi-device sync, and cloud-agnostic architecture (starting with Supabase). All MLS cryptography and state are stored client-side for maximum privacy.

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Roadmap](#roadmap)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

## Features

- **End-to-End Encryption**: MLS-based cryptography with all keys stored client-side
- **WebAuthn Authentication**: Passkey-based login with biometric/hardware support
- **Multi-Device Sync**: Seamless experience across devices
- **Cloud-Agnostic**: Easily migrate between providers (Supabase, AWS, etc.)
- **Web-First**: SPA client supporting modern browsers including mobile Safari

## Architecture

MLS-Chat follows a client-server architecture with strict separation of concerns:

- **Client**: Web SPA handling UI, MLS cryptography, and local storage
- **Authentication Service (AS)**: Handles user registration/login via WebAuthn
- **Delivery Service (DS)**: Manages message delivery via WebSocket
- **Database**: Stores encrypted data and metadata

All MLS operations (encryption, key management) happen client-side. Servers only see ciphertext.

- **Tech stack and auth**: [docs/OPENSOURCE_STACK.md](docs/OPENSOURCE_STACK.md) — WebAuthn (SimpleWebAuthn v13), Supabase Edge Functions, DB schema, client stack.
- **Diagrams**: [diagrams/architecture.md](diagrams/architecture.md) (if present).

## Installation

### Prerequisites

- Node.js 18+
- Rust toolchain (for WASM)
- Supabase account

### Setup

1. **Clone and install:**
   ```bash
   git clone https://github.com/your-org/mls-chat.git
   cd mls-chat/client
   npm install
   ```

2. **Configure Supabase:**
   - Create a Supabase project
   - Set environment variables in `.env`

3. **Build WASM:**
   ```bash
   cd src/mls
   # Build MLS WASM library
   ```

4. **Run locally:**
   ```bash
   npm run dev
   ```

For detailed setup, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

The project follows a phased implementation plan:

### Phase 1: Core Infrastructure (High Priority)

1. **MLS WASM Implementation**
   - WASM library for MLS operations
   - Client-side state management in IndexedDB

2. **Web Client UI**
   - React/Vue SPA with mobile support
   - WebAuthn mandatory authentication

3. **Authentication Service**
   - Supabase Edge Function for WebAuthn registration/login
   - Secure storage of encrypted private keys

4. **Delivery Service**
   - WebSocket-based message delivery
   - Server sequence numbering

5. **WebAuthn Integration**
   - PRF-based key derivation
   - Cross-device compatibility

### Phase 2: Polish and Testing (Medium Priority)

6. **Database Schema**
   - Optimized tables with RLS policies

7. **E2E Testing & Security Audit**
   - Comprehensive test suite
   - Third-party security review

### Phase 3: Launch (Low Priority)

8. **Documentation & Deployment**
   - Complete docs and CI/CD setup

See [.opencode/tasks/final-implementation.md](.opencode/tasks/final-implementation.md) for detailed task breakdown.

## Documentation

- **[docs/OPENSOURCE_STACK.md](docs/OPENSOURCE_STACK.md)** — What we use and how: WebAuthn (passkeys, SimpleWebAuthn v13), Supabase Edge Functions, database, client stack. For contributors and self-hosters.
- **[docs/DEPLOY_STEPS_NOW.md](docs/DEPLOY_STEPS_NOW.md)** — Step-by-step deploy (Supabase + frontend).
- **[docs/DEPLOY_MINIMUM_CHAT.md](docs/DEPLOY_MINIMUM_CHAT.md)** — Deploy architecture (e.g. Cloudflare Pages + Supabase).

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.
