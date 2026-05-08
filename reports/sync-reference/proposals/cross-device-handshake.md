# Cross-Device Handshake (Phase 2) — Implementation Proposal

> Tier-2 sync feature proposal. Companions:
> [encrypted-csync-payload.md](encrypted-csync-payload.md) and
> [visual-conflict-diff.md](visual-conflict-diff.md).

## Proposed Approach

Device A generates a **handshake token** (~220 bytes, Base64url-encoded)
containing device metadata (name, device id, folder hint, app version)
and presents it via a **6-digit numeric shortcode** (human-typeable)
plus an optional QR code. Device B enters the code (or scans the QR)
to populate form fields with Device A's suggested device name and
watch-folder heuristics, reducing friction and confirming alignment
*before* the unavoidable `showDirectoryPicker()` call. The handshake
is **symmetric** — both devices can initiate, and the token carries no
secrets (encryption passphrases stay local). Transport is
**human-mediated**: manual typing as primary path; QR/camera as
friction-reducing bonus. After the handshake, Device B completes the
folder pick and both devices sync normally via the watcher.

## Bundle Format

```json
{
  "v": 1,
  "deviceId": "dev_1234567890_abc123",
  "deviceName": "Katie's iMac",
  "appVersion": "1.0.8",
  "folderHint": {
    "displayName": "My Dropbox/Cross Stitch Patterns",
    "approxSize": 15242880,
    "estimatedFileCount": 127,
    "lastSyncAt": "2026-05-08T14:23:00Z"
  },
  "checksum": "5d41402abc4b2a76b9719d911017c592"
}
```

| Field                           | Notes |
|---------------------------------|---|
| `v`                             | Version flag (currently `1`) |
| `deviceId`                      | E.g. `dev_1234567890_abc123` ([sync-engine.js:70](../../../sync-engine.js#L70)) |
| `deviceName`                    | Device A's human name; Device B displays *"Joining with Katie's iMac"* |
| `appVersion`                    | Flags incompatibility if Device B is much older |
| `folderHint.displayName`        | Truncated path / user label; helps Device B recognise the right folder |
| `folderHint.approxSize`         | Total bytes in watch folder (sanity check) |
| `folderHint.estimatedFileCount` | `.csync` files present (sanity check) |
| `folderHint.lastSyncAt`         | ISO timestamp; helps Device B verify folder is active |
| `checksum`                      | SHA-256 of the rest as JSON; rejects manual-entry typos |

**Encoding**: JSON → pako DEFLATE (~40–45 % smaller) → Base64url. Final
token ~220 bytes, well within QR v3–4 capacity.

## Transport Mechanism

**Primary — Numeric shortcode**: take the first 20 bits of the
checksum as a decimal (0–999,999). Device A displays *"Give this code
to your other device: 482 917"*. Device B enters it; the app
decompresses the full token from a Device A localStorage cache (key
`cs_handshake_tokens`, max 5 entries) or prompts for token paste if
not cached. Works on any device, no camera required, screenshot-friendly.

**Secondary — QR code**: render the full Base64url token as a QR (v3–4)
using **qrcode-svg** (~1.4 KB minified, no runtime deps). Device B
scans via the BarcodeDetector API on Chromium, falls back to manual
paste on Firefox / Safari.

**Fallback — Manual paste**: full Base64url token shown in a
`<textarea>`; Device B pastes into an input. Validator checks
checksum.

## UX Flow

### Device A — Generator Modal

1. User taps **"Pair another device"** in sync settings.
2. Modal title: *"Pair a new device"*.
3. Optionally rename the device (becomes Device B's suggestion).
4. **Generate** → token + shortcode + QR appear.
5. UI shows the 6-digit code (large, monospace), the QR (100×100,
   tap-to-enlarge), and a Copy-token button.

### Device B — Join Existing Sync

1. Home / onboarding detects no watch folder set.
2. Prompt: *"Set up sync?"* → choose *"Join existing folder"*.
3. Modal: *"Join another device's sync"*.
4. Two tabs:
   - *Enter 6-digit code* (default) — auto-formatted as `482 917`.
   - *Scan QR code* — opens camera; falls back to paste textarea on
     non-Chromium browsers.
5. **Verification screen**: *"You're joining **Katie's iMac** (last
   active May 8 at 2:23 PM). This device will watch ~/Dropbox/Cross
   Stitch Patterns (~127 files, ~15 MB)."* Editable suggested device
   name (auto-set to *"Katie's other device"* to avoid collision).
6. **Confirm & pick folder** → `showDirectoryPicker()` opens. User
   selects the same folder Device A is using.
7. *"Setup complete!"*.

## Integration Points

- New SyncEngine API: `generateHandshakeToken()`,
  `validateHandshakeToken(input)`. Lives next to the device-identity
  helpers ([sync-engine.js:70](../../../sync-engine.js#L70)).
- New entry point in [home-app.js](../../../home-app.js#L1115) (or the
  onboarding wizard) for *"Join existing sync"*, triggered when no
  watch folder is set.
- Token cache in `localStorage['cs_handshake_tokens']` (array of
  `{code, token, expiry, recipientName}`, capped at 5).
- Two new modals in [modals.js](../../../modals.js):
  `HandshakeGeneratorModal`, `HandshakeConsumerModal`.

## Security Model

**Protected**:

- No passphrases or encryption keys travel via the handshake — those
  remain device-local (see [encrypted-csync-payload.md](encrypted-csync-payload.md)).
- The browser still requires `showDirectoryPicker()` per device; the
  handshake only suggests a friendly name.

**Exposed (acceptable)**:

- Device name (already visible in the folder's `.csync` file names).
- Device id (pseudonymous; user can regenerate via [sync-engine.js
  `regenerateDeviceId`](../../../sync-engine.js)).
- Folder hint (display name, size, file count, last sync time) —
  side-channel UX data only.

**Threats**:

- *Shoulder-surfing the code or QR*: low impact — same data the user
  just typed in; not a secret.
- *Network MITM*: not applicable — handshake is local / human-mediated.
- *Token in clipboard / browser history*: standard browser hygiene.

## Dependencies

| Library              | Size              | Notes |
|----------------------|-------------------|---|
| `qrcode-svg` ^1.1.0  | ~1.4 KB min+gzip  | QR generation, no runtime deps |
| `pako` (existing)    | already bundled   | Token compression |
| BarcodeDetector API  | native            | Chromium 83+; fallback to manual paste elsewhere |
| `jsQR` ^1.4.0        | ~3.2 KB           | Optional Firefox / Safari camera polyfill — defer to Phase 2.1 |

## Effort Estimate

| Component                      | Person-days |
|--------------------------------|-------------|
| Engine (token / checksum / cache + tests) | 1–1.5 |
| UI — Device A generator modal  | 1–1.5       |
| UI — Device B consumer modal   | 2–2.5       |
| Integration / wiring           | 1           |
| Tests (unit + Playwright)      | 1–1.5       |
| Docs / QA                      | 0.5–1       |
| **Total**                      | **7–9 pd**  |

## Open Questions

1. **Token expiry** — should codes expire after ~15 min? *Recommended:
   no expiry for MVP; add later if reuse problems appear.*
2. **Stale folder hint** — Device A may be offline; Device B's
   verification screen should caveat *"Last known update: …"*.
3. **Device-name collision** — auto-rename (`name_2`) silently or
   warn? *Recommended: auto-rename; names are UX, not unique keys.*
4. **Reverse pairing (B → A)** — symmetric or one-way? *Recommended:
   symmetric; simplifies the mental model.*
5. **Device-id collision detection** — should `validateHandshakeToken`
   pre-check against existing peers? *Recommended: yes; warn before
   folder pick.*

## Recommendation

Ship MVP as **manual code entry only** (~5 person-days for a focused
engineer). Add QR / camera in Phase 2.1 if telemetry shows desktop
users want it. Reserve `jsQR` polyfill for Phase 2.2.
