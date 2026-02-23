# AuthService Protocol

Authentication is passkey/WebAuthn-based. The client derives `user_id` from the MLS public key. The MLS **private** key is derived deterministically on-device from the passkey PRF output (HKDF-SHA-256) and is **never sent to the server** — not in registration, not in login, not ever. The server stores and returns only the MLS **public** key (`mls_public_key`), used for KeyPackage operations during group invites.

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
  "challenge_id": "uuid",
  "challenge": "base64-encoded-challenge",
  "ttl": 300000
}
```

The challenge is valid for 5 minutes (300000 ms). The client uses this challenge in WebAuthn create/get operations.

## POST /auth/register

Request body:

```json
{
  "challenge_id": "uuid",
  "user_id": "string",
  "device_id": "string",
  "mls_public_key": "base64",
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
  "mls_public_key": "base64",
  "profile": {
    "userId": "string",
    "displayName": "string",
    "avatarUrl": "string|null"
  }
}
```

## POST /auth/keypackage

Request body:

```json
{
  "user_id": "string",
  "device_id": "string"
}
```

Response body:

```json
{
  "key_package": "base64"
}
```

The server returns the MLS key package (public key) for the specified device. This is used for adding members to MLS groups.

The server validates WebAuthn responses according to the [WebAuthn Level 2 specification](https://www.w3.org/TR/webauthn-2/). Key validation steps:

1. Verify the challenge matches the one issued in POST /auth/challenge.
2. Check the origin and RP ID.
3. Validate the authenticator data and signature.
4. For registration, store the credential ID and public key.
5. For login, match the credential ID with stored data.

The client uses the passkey PRF output (HKDF-SHA-256) to re-derive the MLS private key on-device. The login response's `mls_public_key` is used only for KeyPackage operations. No private key material ever leaves the device.
