# Contributing to MLS-Chat

Thank you for your interest in contributing to MLS-Chat! This document provides guidelines for contributors.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Working with Technologies](#working-with-technologies)
- [Code Guidelines](#code-guidelines)
- [Submitting Changes](#submitting-changes)
- [Reporting Issues](#reporting-issues)
- [Resources](#resources)

## Getting Started

MLS-Chat is an open-source end-to-end encrypted chat application built with Messaging Layer Security (MLS). The project emphasizes client-side cryptography, WebAuthn authentication, and cloud-agnostic architecture.

Before contributing, familiarize yourself with:
- [README.md](../README.md) - Project overview and setup
- [spec/](../spec/) - Detailed specifications for protocols and services
- [.opencode/tasks/final-implementation.md](../.opencode/tasks/final-implementation.md) - Implementation roadmap

## Development Setup

### Prerequisites

- Node.js 18+ and npm/yarn
- Rust toolchain (for WASM development)
- Supabase CLI
- Git

### Local Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-org/mls-chat.git
   cd mls-chat
   ```

2. **Install dependencies:**
   ```bash
   # For the client
   cd client
   npm install

   # For backend (if needed)
   cd ../backend/supabase
   supabase start
   ```

3. **Set up Supabase:**
   - Create a Supabase project
   - Copy `.env.example` to `.env` and fill in your Supabase credentials
   - Run migrations: `supabase db push`

4. **Build WASM modules:**
   ```bash
   cd client/src/mls
   # Build WASM library (specific commands depend on implementation)
   ```

5. **Start development server:**
   ```bash
   cd client
   npm run dev
   ```

## Working with Technologies

### WASM and MLS

- MLS cryptography is handled in WASM for performance and security
- State (trees, keys, history) is stored client-side in IndexedDB
- Use the TypeScript wrapper in `client/src/mls/` for integration

### Supabase

- Authentication Service (AS) and Delivery Service (DS) are implemented as Edge Functions
- Database schema in `backend/supabase/tables/`
- Ensure all logic is cloud-agnostic; avoid Supabase-specific features in core protocols

### WebAuthn

- Mandatory for authentication; no password fallback
- Use WebCrypto API for key derivation (PRF extension)
- Test on devices with biometric/hardware keys

## Code Guidelines

### Style

- Use TypeScript for type safety
- Follow ESLint/Prettier configuration
- Use functional programming patterns where appropriate
- Keep components small and focused

### Security

- Never expose private keys or unencrypted data to servers
- All MLS operations client-side only
- Validate WebAuthn support before proceeding

### Testing

- Write unit tests for critical functions
- E2E tests for full flows (registration, messaging)
- Test on target browsers: Chrome 67+, Firefox 60+, Safari 14+, Edge 18+

## Submitting Changes

1. **Create a branch:**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make changes and test:**
   - Ensure tests pass
   - Update documentation if needed

3. **Commit with clear message:**
   ```bash
   git commit -m "feat: add feature description"
   ```

4. **Push and create PR:**
   ```bash
   git push origin feature/your-feature-name
   # Create PR on GitHub
   ```

### PR Guidelines

- Title: `type: description` (e.g., `feat: add group creation UI`)
- Description: Explain what, why, and how
- Reference issues/tasks
- Keep PRs focused on one feature
- Request review from maintainers

## Reporting Issues

- Use GitHub Issues
- Include: browser/version, OS, steps to reproduce, expected vs actual behavior
- For security issues: email maintainers directly

## Resources

- [MLS Specification](https://messaginglayersecurity.rocks/)
- [WebAuthn Guide](https://webauthn.guide/)
- [Supabase Docs](https://supabase.com/docs)
- [Project Specs](../spec/)
- [Implementation Tasks](../.opencode/tasks/)</content>
