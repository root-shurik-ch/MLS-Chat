# AuthService Protocol

Authentication is passkey/WebAuthn-based. The client derives `user_id` from the MLS public key and never sends MLS private key in plaintext. Instead, it sends `mls_private_key_enc` encrypted using a key derived from the passkey (e.g. WebAuthn PRF).

See [spec/identity_and_passkeys.md](identity_and_passkeys.md) for details on user ID derivation, key encryption, and WebAuthn flows.

## POST /auth/challenge

Used to obtain a WebAuthn challenge for registration or login. The challenge is a cryptographically secure random value that prevents replay attacks.

Request body:

```json
{
  "action": "register" | "login"
}
```

Response body:

```json
{
  "challenge": "base64-encoded-challenge",
  "ttl": 300000
}
```

The challenge is valid for 5 minutes (300000 ms). The client uses this challenge in WebAuthn create/get operations.

## POST /auth/register

Request body:

```json
{
  "user_id": "string",
  "device_id": "string",
  "display_name": "string",
  "mls_public_key": "base64",
  "mls_private_key_enc": "base64",
  "webauthn_create_response": {}
}
```

Response body:

```json
{
  "user_id": "string",
  "auth_token": "string",
  "profile": {
    "userId": "string",
    "displayName": "string",
    "avatarUrl": "string|null"
  }
}
```

## POST /auth/login

Request body:

```json
{
  "user_id": "string",
  "device_id": "string",
  "webauthn_get_response": {}
}
```

Response body:

```json
{
  "user_id": "string",
  "auth_token": "string",
  "mls_private_key_enc": "base64",
  "mls_public_key": "base64",
  "profile": {
    "userId": "string",
    "displayName": "string",
    "avatarUrl": "string|null"
  }
}
```

## Server Validation

The server validates WebAuthn responses according to the [WebAuthn Level 2 specification](https://www.w3.org/TR/webauthn-2/). Key validation steps:

1. Verify the challenge matches the one issued in POST /auth/challenge.
2. Check the origin and RP ID.
3. Validate the authenticator data and signature.
4. For registration, store the credential ID and public key.
5. For login, match the credential ID with stored data.

The client:

Uses WebAuthn to obtain a secret (via PRF or similar) to decrypt mls_private_key_enc.

Uses the decrypted MLS private key to initialize the MLS layer.
