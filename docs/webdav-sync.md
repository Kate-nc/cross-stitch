# Automatic WebDAV synchronisation

WebDAV is the single new automatic transport. stitchx remains a static, local-first PWA: there is no application backend, hosted identity service, paid-account requirement or provisioning step. Nothing was deployed for this change. An existing or self-hosted WebDAV service supplies authentication, private storage and collection access controls. Nextcloud is one self-hostable example; this is a WebDAV integration, not a separate Nextcloud provider. See its [official WebDAV guide](https://docs.nextcloud.com/server/latest/user_manual/en/files/access_webdav.html) and the [WebDAV standard](https://www.rfc-editor.org/rfc/rfc4918).

## Prerequisite and rationale

Accepted protocol PR [#339](https://github.com/Kate-nc/cross-stitch/pull/339) is in the base through merge `50882b02`; this branch starts at accepted main `c6c3598a`. Its version-2 merge registers, accounting, SHA-256 attachment manifest, deletion evidence and replay rules are reused. No prerequisite PR was merged by this task. The initial protocol/encryption/convergence/accounting run passed 57 tests before transport work.

There is no existing OAuth/provider integration, server database, session cookie or application account. Introducing a hosted backend solely for sync would add deployment and identity requirements to a static app. WebDAV instead exchanges the existing complete compressed `.csync` envelope with user-configured storage. Attachments stay inside that envelope and pass the existing ownership, hash, size, photo-pair, deletion and collision checks. Existing optional encryption is unchanged; no new cryptography is introduced.

## Set up your server and deployment

1. Update every stitchx device to a version that understands `.csync` v2. Make a separate full backup first.
2. Use an existing WebDAV server or arrange your own self-hosted server outside this task. Create a **private collection for this one library/account**, for example `stitchx/` within your user's files. Never use an anonymous/public share. Give access only to your own devices. A collection shares the whole library; it has no individual-project sharing controls.
3. In Nextcloud, create an app password in the account's Security settings and a `stitchx` folder in Files. A typical collection URL is `https://your-host/remote.php/dav/files/your-username/stitchx/`. Use the account's actual username/path shown by its WebDAV settings. Preserve URL percent-encoding; do not include credentials, query strings or fragments in the URL. Other compliant WebDAV servers can use their own collection URLs.
4. **Keep the deployed Content Security Policy narrow.** The repository's CSP remains unchanged. Either expose the authenticated DAV collection through a reverse proxy under the same HTTPS origin as your self-hosted stitchx (for example `https://stitchx.example/dav/stitchx/`), or have the deployment maintainer add **only your chosen DAV origin**, such as `https://files.example`, to `connect-src` in `home.html`, `create.html`, `index.html`, `stitch.html` and `manager.html`. Rebuild fingerprints with `node build-sw.js` when producing that configured deployment. Do not add wildcard HTTPS access. If a hosting platform also sets a CSP header, configure the same explicit origin there. The unconfigured static Vercel deployment does not proxy WebDAV or permit arbitrary DAV destinations.
5. For a different origin, configure CORS on the DAV server/reverse proxy as below. Browsers may also require a local-network permission for servers on a private network; grant it only for your intended server. It must be present on errors as well as successful responses, or the browser cannot distinguish expired credentials from a network failure. A same-origin proxy must also authenticate/authorise every DAV request, preserve the per-user path boundary and forward conditional headers without logging Authorization.
6. Verify the contract below. Use trusted, maintained server software; the local test fixture is not a server to deploy.

Required HTTP contract:

| Capability | Required behaviour |
| --- | --- |
| TLS | Valid HTTPS certificate; HTTP is accepted only for localhost development |
| Authentication | HTTP Basic with a revocable dedicated app password; 401/403 after expiry/revocation |
| Authorisation | Every listing, read and write confined to the authenticated user's private collection. Deny another user's collection, guessed files and anonymous requests |
| Listing | `PROPFIND`, `Depth: 1`, `207` DAV multistatus, collection-relative or absolute same-origin hrefs; at most 100 device files |
| Reads | `GET`, `404` for missing files, complete bytes; conditional GET/304 recommended |
| Writes | Atomic replacement on successful `PUT`; strong ETag returned on GET **and PUT**; `If-None-Match: *` and `If-Match` enforced with `412` on mismatch |
| CORS methods | `OPTIONS, PROPFIND, GET, PUT` |
| CORS allowed origin | The exact origin of your stitchx deployment, such as `https://stitchx.example`; avoid reflecting arbitrary origins |
| CORS request headers | `Authorization, Depth, Content-Type, If-Match, If-None-Match` |
| CORS exposed headers | `ETag, Content-Length`; add `Vary: Origin` when responses vary by origin |
| Preflight | Answer OPTIONS without requiring the unavailable preflight Authorization header. Authenticate every subsequent DAV operation |

CORS is browser permission, not an access-control mechanism. A server must enforce authentication and collection ACLs even for clients that do not send Origin. Check anonymous requests, a second account, denied project/file paths and revoked passwords yourself before putting real data there. Users authorised for a collection can read every project and attachment in it. stitchx never treats a project ID or filename as a permission grant.

A deployment administrator can inspect a preflight without entering a password:

```sh
curl -i -X OPTIONS 'https://files.example/your-private-collection/' \
  -H 'Origin: https://stitchx.example' \
  -H 'Access-Control-Request-Method: PROPFIND' \
  -H 'Access-Control-Request-Headers: authorization,depth,content-type'
```

For authenticated probes, use `curl --user your-username` and let curl prompt for the password; do not paste a password into commands, screenshots or issue reports. Keep server/reverse-proxy access logs from recording Authorization. The fixture's two-account tests verify the expected contract, not the configuration of your chosen server.

## Connect and use

Open **File > Preferences > Sync, backup & data > Automatic WebDAV sync**. Enter the collection URL, username and app password, then **Connect and sync**. Repeat on each device using the same account and collection. Connecting explicitly uploads the entire current local library and enabled stash/settings. Use a separate browser profile/site storage for each unrelated account: changing server credentials is not a way to switch or erase the local library.

Credentials and connection configuration stay in the current page's memory. The password field is cleared when submitted. Passwords do not enter localStorage, sessionStorage, IndexedDB, sync files, backups, URLs, activity logs or status messages. Requests omit cookies and referrers, disable caching and reject redirects. Re-enter credentials after reload, page navigation or app closure. This deliberate first implementation avoids claiming secure persistent browser secret storage or adding a backend just to hold secrets. A script running in the page has its privileges; use a trusted deployment and maintain its existing script security.

Keep **one connected tab per device**. Visible online pages poll every 15 seconds and coalesce local save notifications with a one-minute upload cooldown. Retry now bypasses that cooldown. Hidden/offline pages pause network work and recheck when foregrounded. Changes made locally while offline remain available and sync after reconnection. A local import already committing is allowed to finish; it uses the protocol's conditional writes and retryable storage boundaries. Background suspension, tab closure and OS termination can interrupt work. **Continuous iOS background sync is not provided.** The app does not register background sync jobs or put credentials in its service worker.

- **Retry now** resumes a cancelled connection and retries current local data.
- Transient failures use exponential backoff capped at five minutes; a 45-second cycle timeout aborts stalled requests. Conflicts or invalid files are not silently resolved.
- **Cancel sync** pauses this page's connection and cancels network work. Retry resumes it.
- **Disconnect** forgets credentials, aborts network work, waits for an import already committing and clears this transport's queued review. It deletes no local projects, photos, tracing pictures, stash or backups. Remote files remain. Disconnect other tabs separately.
- A visible 401/403 stops requests and discards credentials. Generate/re-enter a valid app password and connect again. A CORS-masked 401 is indistinguishable from a network error; correct the server's error-response CORS configuration.
- A `412` writer collision pauses automatically. Check for a copied browser/device identity or simultaneous writer, disconnect, fix the identity in existing Sync settings if necessary, then reconnect. Do not bypass conditional writes.
- Use **File > Review sync** for concurrent notes, chart structure, incompatible stock baselines, attachment identity collisions and other protocol decisions. Other incoming files wait while a review is outstanding. Safe progress histories merge automatically; no conflict winner is invented.

The local-save badge, WebDAV transfer status and backup status mean different things. Last upload means the server accepted a complete conditional PUT; it cannot confirm another device received it. Last download applied means required local writes finished. A queued save, paused transfer, failed upload or pending review cannot be labelled sent. Existing manual/folder import/export status remains separately labelled; a successful file export is not a WebDAV upload or backup.

## Transfer and recovery boundaries

Each device writes `stitchx-<deviceId>.csync`, using the existing local device identity. At connect/retry after an uncertain write, the client reads its own resource's current strong ETag; subsequent writes use a conditional replacement. A failed acknowledgement may leave a complete remote snapshot. Retry resends a whole current snapshot, and protocol registers/event identities prevent double application or duplicate consumption. There is no remote command queue or custom revision protocol. Do not copy device IDs between active profiles.

Successful incoming delivery IDs and read ETags are cached only in this connection and scoped to its collection. They advance after application, not before validation or while a review is unresolved. Reconnect revalidates/replays against real local state. Redirected, cross-origin, nested, traversal, query-bearing and unrelated listing hrefs are ignored; only constructed immediate protocol filenames are requested.

The transport bounds listing XML to 1 MiB, a compressed file to 64 MiB, inflated JSON to 128 MiB and device files to 100. The existing protocol imposes its own stricter attachment limits. Transfers restart the complete file; there is no byte-range resume. Storage application is retryable across project/store transactions, not atomic across the whole library. A failed import does not acknowledge completion; already committed work is safe to replay. Attachment blobs retain the existing atomic publication and conflict checks.

Automatic sync is replication, not historical backup. Keep separate full backups and server backups/version history as appropriate. Do not remove peers' device files until those peers and their old offline deliveries are retired deliberately. The transport itself never deletes remote files, performs tombstone compaction, provisions servers or deploys infrastructure.

See [separate review and test evidence](webdav-sync-review.md) and [existing protocol semantics](sync-protocol.md).
