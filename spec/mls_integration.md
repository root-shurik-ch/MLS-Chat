# MLS Integration

This document describes how MLS (Messaging Layer Security) is integrated into the client-side chat application. All MLS state and cryptography reside on the client; servers only handle ciphertext routing.

See RFC 9750 for MLS protocol details. See identity_and_passkeys.md for key management.

## Database Tables

The following Supabase tables support MLS integration:

### devices
- `device_id` (text, primary key): Unique device identifier.
- `user_id` (text, fk to users): Associated user.
- `mls_pk` (text): MLS public key (base64).
- `mls_sk_enc` (text): Encrypted MLS private key (base64).

Each device has its own MLS identity keypair, enabling multi-device support per user.

## Creating a New Group

1. Client generates a new Group ID (UUID).
2. Create MLS Group with initial member (self, deviceId).
3. Generate KeyPackage for self.
4. Send initial handshake message (Commit) via DS.
5. Store group metadata in IndexedDB.

## Adding Members

To add a member:

1. Obtain the new member's KeyPackage (from their deviceId).
2. Propose Add proposal.
3. Send Commit to apply the proposal.
4. DS delivers the Commit and Welcome message (RFC 9750) to the new member.
5. New member processes Welcome to join the group.

Welcome messages are encrypted and sent out-of-band via DS.

## Message Processing Order

Messages are processed in this order:

1. **Proposals**: Accumulate until a Commit.
2. **Commit**: Applies pending Proposals, advances epoch.
3. **Application Messages**: Encrypted chat messages.

Clients buffer messages until they can be processed in sequence.

## State Management

MLS state is stored in IndexedDB on the client:

- `mls_groups`: group_id, name, avatar_url, ds_url, current_epoch, tree_hash
- `mls_messages`: group_id, server_seq, mls_bytes, decrypted_content (optional)
- `pending_proposals`: group_id, proposal_data, sender_id
- `key_packages`: device_id, key_package_bytes

On the server side, the following Supabase tables manage device and key data:

- `devices`: See [Database Tables](#database-tables).

## Encryption/Decryption Flow

To send a message:

1. Encrypt plaintext using MLS group key.
2. Send `mls_bytes` to DS.

To receive:

1. Receive `mls_bytes` from DS.
2. Decrypt using current group key.
3. Update group state if epoch advances.

## Epoch Management

Epochs provide forward secrecy (FS) and post-compromise security (PCS).

- Each Commit advances the epoch.
- Old keys are discarded after epoch change.
- Clients must process Commits in order before application messages.