# Encrypted `.csync` Payload — Implementation Proposal

> Tier-2 sync feature proposal generated as part of the post-Tier-1
> hardening cycle. Companion proposals:
> [cross-device-handshake.md](cross-device-handshake.md) and
> [visual-conflict-diff.md](visual-conflict-diff.md).

## Proposed Approach

Encrypt the decompressed JSON payload (after `pako.inflate`) using
AES-GCM with a user-supplied passphrase. Introduce a `_encrypted`
flag at the JSON level and a new encryption metadata object
(`_encryption`) containing salt, iteration count, and IV. This sits
between decompression and JSON parsing, preserving backward
compatibility: unencrypted files lack the flag and decompress
normally; encrypted files are rejected at the shape-validation gate
([sync-engine.js:2029-2049](../../../sync-engine.js#L2029-L2049)) if
decryption fails. The passphrase is never persisted — users re-enter
it each session, or share via out-of-band channels (email,
messaging). For key derivation, use PBKDF2 with 310,000 iterations
(OWASP 2023 minimum) and a random 16-byte salt; the derived key is
kept in memory only during import/export operations.

## File-Format Change

Current flow:

```
JSON → UTF-8 → pako.deflate → binary file
```

New flow (encrypted):

```
JSON (with _encrypted, _encryption fields)
  → stringify
  → UTF-8
  → AES-GCM encrypt
  → pako.deflate
  → binary file
```

Decompressed JSON structure (added fields):

```json
{
  "_format": "cross-stitch-sync",
  "_version": 1,
  "_encrypted": true,
  "_encryption": {
    "algorithm": "AES-GCM",
    "saltHex": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
    "iterations": 310000,
    "ivHex": "f1e2d3c4b5a69788",
    "tagHex": "4a3b2c1d0e9f8a7b6c5d4e3f2a1b0c0d"
  },
  "_createdAt": "2024-05-08T12:00:00Z",
  "_deviceId": "dev_1712345678_abcdef",
  "projects": [ ... ],
  "stash": { ... },
  "prefs": { ... }
}
```

Wire format bytes:

- **Salt**: 16 bytes (random, hex in `_encryption.saltHex`).
- **IV**: 12 bytes (random per file, hex in `_encryption.ivHex`).
- **Tag**: 16 bytes (GCM authentication tag, hex in `_encryption.tagHex`).
- **Ciphertext**: encrypted bytes of the entire JSON payload.

Salt and IV are included in plaintext — attackers who obtain the file
already see them, and persisting them lets multi-device users re-derive
the key from the same passphrase without negotiation.

## Crypto Parameters

- **Algorithm**: AES-GCM-256 (`crypto.subtle.encrypt('AES-GCM', ...)`).
- **Key derivation**: PBKDF2-SHA256, 310,000 iterations, 16-byte salt.
- **Key size**: 256 bits.
- **IV**: 12 bytes (96 bits), random per file.
- **Auth tag**: 16 bytes (128 bits), built into GCM output.
- **Plaintext**: UTF-8-encoded JSON string.

**Why AES-GCM over AES-CBC + HMAC**: single primitive (no two-key
management, no padding-oracle exposure); built-in authentication;
constant-time tag verification handled by the Web Crypto API; smaller
output (no separate MAC).

## API Additions to SyncEngine

```javascript
SyncEngine.setEncryptionPassphrase(passphrase)   // session-scoped
SyncEngine.getEncryptionStatus()                 // { enabled, hasPassphrase }
SyncEngine.clearEncryptionPassphrase()           // logout / app close

// Internal
async function _deriveKey(passphrase, saltHex, iterations) // → CryptoKey
function compressEncrypted(syncObj, passphrase)             // → Uint8Array
function decompressEncrypted(arrayBuffer, passphrase)       // → syncObj
```

`exportSync()` becomes encryption-aware: if a passphrase is set, it
calls `compressEncrypted` instead of `compress`. `readSyncFile()`
checks for `_encrypted: true` after decompression and routes through
the decryption path before passing to `_isProjectShapeValid`.

## UX Touchpoints

1. **Enable / disable**: new toggle in Preferences — *"Encrypt sync
   files with passphrase"*. Default OFF. Toggling ON prompts twice for
   confirmation. Toggling OFF warns *"Existing encrypted files will not
   auto-decrypt on import."*
2. **First import of an encrypted file**: detect `_encrypted: true`
   before shape validation; modal *"This sync file is encrypted. Enter
   passphrase:"* with a password input and a Decrypt button. On
   success, cache the passphrase in `_encryptionPassphrase` for the
   session.
3. **Multi-device**: Device A enables encryption with passphrase X;
   Device B is prompted for X on first import; cached for the session.
4. **Forgotten passphrase**: no recovery. Show explicit warning at
   toggle-on time.

## Migration Plan

Existing unencrypted `.csync` files keep working:

1. `readSyncFile()` decompresses → checks `_encrypted` field.
2. Absent / `false` → proceed as today.
3. `true` → require passphrase before parsing.

Schema versioning: keep `SYNC_VERSION = 1`. Encryption is opt-in via a
flag at the JSON layer; old readers that don't understand `_encrypted`
will surface a parse error, which the manual review path can present
as *"This file requires a newer version of the app."*

## Security Caveats

**Protects against**:

- Cloud provider (Dropbox / iCloud / OneDrive) reading pattern,
  stash, or preference data at rest or in transit through their
  infrastructure.
- Passive network observers intercepting projects via the cloud-sync
  channel.
- Opportunistic attackers with access to file backups.

**Does NOT protect against**:

- Device compromise (malware can capture the passphrase).
- Weak passphrases — PBKDF2 with 310k iterations still loses to
  brute-force on `123456`-class secrets.
- Side-channel leaks (stack traces, timing of input handlers).
- Metadata leakage (file size, creation date, device id are
  intentionally plaintext for sync logic).
- Sync-watcher races during decryption on the receiving device.

## Effort Estimate

| Phase   | Task                                                                 | Person-days |
|---------|----------------------------------------------------------------------|-------------|
| Engine  | `_deriveKey`, `compressEncrypted`, `decompressEncrypted`             | 0.5         |
|         | Modify `exportSync`, `readSyncFile`, `downloadSync`                  | 0.5         |
|         | `setEncryptionPassphrase`, `getEncryptionStatus`, clear              | 0.3         |
|         | Update `_isProjectShapeValid` reject path on decrypt failure         | 0.2         |
| UI      | Preferences toggle + setup modal                                     | 0.5         |
|         | Import passphrase prompt                                             | 0.3         |
|         | Warning / confirmation dialogs                                       | 0.2         |
| Testing | Unit (encrypt/decrypt, key derivation, format round-trip)            | 0.5         |
|         | Integration (multi-device flow, legacy file handling)                | 0.5         |
|         | Manual (weak-passphrase warning, wrong-passphrase recovery)          | 0.3         |
| Docs    | Help text, sync guide, release notes                                 | 0.2         |
| Buffer  | Edge cases, debugging                                                | 0.4         |
| **Total** |                                                                    | **~4–5 pd** |

## Open Questions

1. **Session memory**: cache passphrase in `sessionStorage` for the
   tab session, or re-prompt every import? *Recommended: session
   cache, cleared on app close.*
2. **Weak-passphrase enforcement**: strength meter only, or block
   entry below an entropy threshold? *Recommended: meter + soft warn.*
3. **Shared-passphrase workflow**: documented manual share, or
   QR-code share flow? *Recommended: manual for MVP; QR in Phase 3.*
4. **Auto-detect imported encrypted files**: silently follow user's
   current setting, or suggest enabling encryption when a peer's
   encrypted file is imported? *Recommended: silent.*
5. **Conflict-merge UI**: should the SyncReviewGate flag mismatched
   encryption status between devices? *Recommended: add
   `_deviceEncryptionEnabled` to plan metadata so the UI can warn.*
