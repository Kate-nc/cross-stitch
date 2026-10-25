# Sync relay (pairing sync)

Pairing sync keeps devices in step without a shared folder, WebDAV server or account. One device shows a code; the other scans it (or types it) inside stitchx. From then on, each device uploads its own `.csync` file to the stitchx sync relay while the app is open and downloads the others'. It works the same on iPad, iPhone, Android and desktop browsers.

The relay is a small Vercel function (`api/relay.js`) in front of an Upstash Redis database. It stores encrypted files it cannot read.

## How it works

| Piece | What it does |
| --- | --- |
| Sync space | A random 128-bit ID shared by paired devices. Holds one file per device (at most 10 devices). |
| Space key | A random 256-bit key, created on the first device and held only by paired devices (in `localStorage`, key `cs_relay_v1`). Never sent to the relay. |
| Files | The normal `.csync` v2 export, encrypted on the device with the existing AES-GCM-256 code (`exportSync({ encryptWith })`), using a passphrase derived from the space key. The user's folder-encryption setting does not affect relay files. |
| Access token | SHA-256 of a label and the space key. Sent as `Authorization: Bearer …` on every request. The relay stores only a SHA-256 of the token, so neither its database nor its logs can be used to read or write a space. |
| Pairing code | 12 characters (60 random bits), shown as `XXXX-XXXX-XXXX` and as a QR code reading `STITCHX-PAIR:XXXXXXXXXXXX`. The code unlocks a pairing bundle (space ID and key) that the relay keeps for 10 minutes, encrypted under a key derived from the code (PBKDF2-SHA256, 310,000 iterations). The relay sees only a hash of the code. |
| Merging | Unchanged: incoming files go through `SyncEngine.receiveAutomatic`, the same path as folder and WebDAV sync, with the same review screen for conflicts. |

Plaintext the relay can see: the space ID, device IDs, file sizes and times, and the unencrypted envelope fields of each file (`_deviceId`, `_deviceName`, `_createdAt`, `_deliveryId`, format and version). Project names, patterns, progress, stash and photos are all inside the ciphertext.

The QR code holds plain text, not a link. On iPad, a link opened from the Camera app would land in Safari, whose storage is separate from the Home Screen app; scanning inside stitchx pairs the copy the stitcher uses.

### When it syncs

While a page is visible and online, a device checks for others' changes about every 90 seconds and straight away when the page comes back into view. It uploads 30 seconds after a local change, then at most every 5 minutes while changes keep coming, and once more when the page is hidden or closed (switching apps, locking the iPad, closing the tab), which is when another device needs its work. **Sync now** skips the wait. Only one tab per browser syncs (Web Locks). Nothing runs in the background: iOS suspends web apps that are not on screen, so the upload on hiding is best effort; the next open catches up.

Writes that apply another device's file are tagged as imports and are not uploaded again, so two devices do not bounce the same changes back and forth.

### Retention

Every key in a space expires 30 days after the last upload by any device in it. Devices keep their own data, so the next device to open stitchx recreates the space from its key and uploads again; the others follow on their next check. Unpairing a device deletes its file at once; the last device to leave deletes the space.

## Setting up the store (once per deployment)

Until this is done, `/api/relay` answers `503 not-configured` and the app says "Pairing sync is not set up on this server." Nothing else changes.

1. In the Vercel dashboard, open the stitchx project, then **Storage** (or the **Marketplace**), and add **Upstash for Redis** (shown as Redis).
2. Create a database on the free plan, in the region nearest most users, and connect it to the stitchx project for all environments.
3. The integration adds the connection settings as environment variables. Either naming scheme works: `KV_REST_API_URL` and `KV_REST_API_TOKEN`, or `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
4. Redeploy so the function picks the variables up.
5. Check it: `curl -i 'https://<your-deployment>/api/relay?op=pair-get&id=0000000000000000000000000000000000000000000000000000000000000000'` should answer `404 {"error":"pairing-missing"}`. `503 not-configured` means the variables are missing; `503 store-unavailable` means the database refused the request.

The function needs no npm packages; it calls the Upstash REST API with `fetch`. No CSP change is needed, because the relay is on the app's own origin.

## Limits and costs

| Limit | Value | Why |
| --- | --- | --- |
| File size per device | 4 MB (compressed and encrypted) | Vercel functions accept at most 4.5 MB per request. Libraries rarely get near this unless Source photos is on in What to sync; the app then says so. |
| Devices per space | 10 | Keeps a space's size bounded. |
| New spaces | 20 per IP address per day | Abuse limit. |
| Pairing requests | 30 per IP address per 10 minutes | Stops code guessing (and 60-bit codes expire after 10 minutes anyway). |

Upstash's free plan allows 500,000 commands, 256 MB of storage and 10 GB of transfer a month. The relay spends one command per check, 2 per download and about 3 plus the number of devices per upload, and every upload and download moves the whole (compressed, encrypted) library.

A rough budget for one stitcher with two devices, stitching two hours a day with a 200 KB library: about 100 commands and 5 MB of transfer per active hour, so roughly 6,000 to 9,000 commands and 150 to 300 MB a month. Transfer runs out first: the free plan covers **a few dozen** such stitchers, fewer with large libraries. Storage is about 1.4 times each device's sync file. Upstash's pay-as-you-go plan charges per command and per GB beyond that; check its pricing page before relying on the free plan for many users. If the relay becomes unreachable, devices keep working locally and catch up once it is back.

## Local development

`node serve.js` serves `/api/relay` too. Without the Upstash variables it uses an in-memory store (`api/_relay-store.js`), lost when the server stops. `tests/e2e/relay-sync.spec.js` pairs two browser contexts through it.

## Files

- `api/relay.js`: the Vercel function (also used by `serve.js`).
- `api/_relay-core.js`: request handling, access checks, limits and expiry. Files starting with `_` in `api/` are not deployed as routes.
- `api/_relay-store.js`: Upstash REST adapter and the in-memory store.
- `relay-sync.js`: the browser side: sync loop, pairing, and the Show code / Enter code dialogs.
- `assets/qrcode-generator.js` (MIT) and `assets/jsqr.js` (Apache-2.0, `assets/jsqr.LICENSE`): QR drawing and camera scanning, loaded on first use and self-hosted so they work offline.

## Not yet done

- Files over 4 MB (would need chunked uploads).
- Per-space storage quotas beyond the device limit, and abuse controls beyond the per-IP limits above. Someone determined, using many addresses, could still fill the free plan's 256 MB; Upstash would then refuse new uploads for everyone (the relay answers `507 storage-full`) until idle spaces expire. Watch the database's usage in the Upstash console after launch.
- A shared driver for WebDAV and the relay. The two loops follow the same pattern but stay separate for now, so the tested WebDAV transport is unchanged.
