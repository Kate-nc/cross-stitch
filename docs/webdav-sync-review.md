# WebDAV transport: separate bug-hunting pass and evidence

The pass followed the first seven working two-client transport scenarios. It focused on authorisation, credential lifetime, retries, duplicate operations, completion claims and foreground/background boundaries. The transport uses accepted `.csync` v2; it does not change its cryptography or merge rules.

## Findings and fixes

| Probe | Outcome |
| --- | --- |
| Two accounts and guessed collection | Local server fixture checks Basic credentials and every collection read/list/write. Bob gets no Alice projects and Bob credentials against Alice's path get 403. Separate browser profiles also remain isolated. Collection sharing includes all its projects, explicitly described in setup/UI. |
| Expired/revoked access | Both simulation and real browser receive 401, stop requests, discard credentials and recover after reconnect. An offline event after revocation no longer hides the reconnect-required status. CORS must be present on server error responses. |
| Secret lifetime and redirection | Password field clears at submit. Whole localStorage/sessionStorage/status inspection and sync-metadata inspection contain no password. Connection configuration/authentication is memory-only. Credential URLs and non-local HTTP URLs are rejected; fetch omits cookies/referrers, disables caching and rejects redirects. No secret-bearing network errors are logged. |
| Host/path injection | DAV hrefs cannot direct authenticated requests to another origin or collection. Only fixed immediate filenames are constructed beneath the selected URL. Listing XML is bounded; DTD/entity declarations are rejected. |
| CSP/deployment | Real browser testing caught the narrow repository CSP blocking an arbitrary DAV origin. Production CSP is preserved. Documented setup uses a same-origin proxy or an explicit chosen-origin deployment configuration. The browser fixture changes only its exact local test origin and checks both default-policy refusal and configured-policy success. No wildcard destination permission is added. |
| Browser test validity | Chromium requires its local-network permission for the loopback fixture. Playwright's CDP request routing automatically answers preflight requests: routing is therefore removed after loading the local app libraries, before DAV traffic. OPTIONS reaches the actual fixture, so CORS/auth error responses are exercised by the browser. |
| Interrupted download/upload | Mid-response/download interruption publishes no partial attachment/project; a truncated upload publishes no remote resource. Full-file retry succeeds. Lost PUT acknowledgement leaves a complete snapshot and retry does not duplicate a project or consumption operation. Required protocol attachment hashes/lengths are checked before application; repair retries the same failed delivery ID. |
| Concurrent writer | Every creation/replacement uses If-None-Match or If-Match. A 412 latches a blocked connection instead of overwriting remote bytes. Retry cannot silently clear that latch or acquire a new ETag; disconnect and identity correction are required. Retry also recovers a removed own resource by clearing its stale ETag and using conditional creation. Reconnect obtains the current ETag; copied device identities require deliberate correction, not force writes. |
| Duplicate operations | Successful delivery IDs/read ETags are scoped to the live connection and only advance after application. Repeated polls settle without re-upload loops. Concurrent Retry calls share one cycle. Reconnect relies on protocol idempotency rather than persisted cross-account cursors. |
| Status accuracy | A save queued after a successful transfer now reports pending. Edits arriving during a transfer remain pending. Failed/lost acknowledgements do not advance the upload timestamp. Last download advances only after required application. Conflicted imports are not labelled transferred; semantic-only conflicts count in the header badge. Local-save and backup state are separate and unchanged. |
| Retry load | Local mutations are coalesced with a one-minute upload cooldown; Retry now bypasses it. Polling continues, conditional GET avoids repeated full attachment downloads, transient retries use bounded backoff, and a 45-second timeout aborts stalled work. Cancellation is not an automatic retry request. |
| Foreground/background | Hidden/offline transitions abort network work; visible/online transitions resume an aborted cycle promptly. Explicit Cancel stays paused across visibility/online events. These are executable lifecycle/event probes, not a claim of uninterrupted iOS execution. |
| Disconnect during local commit | Disconnect invalidates the session and aborts network work, then waits for an already-started local import. A deliberately held local save verifies disconnect does not return early or begin a later upload. Local projects and attachment bytes remain. Cached transport plans emit invalidation so the header does not retain a stale review. Other tabs and remote files are explicitly retained. |

## Executable coverage

`tests/webdavSync.test.js` uses two isolated VM globals, localStorage and fake IndexedDB factories, the real project storage/BlobStore/protocol/compression/crypto code, native fetch streams and a real local HTTP WebDAV contract fixture. The fixture has two account ACLs, conditional atomic writes, CORS and injected interruption/revocation/collision faults. It stores only test bytes in memory and is not production server software.

`tests/e2e/webdav-sync.spec.js` drives the real Preferences panel and real browser contexts, real IndexedDB/Blob bytes and actual cross-origin HTTP requests. It verifies password clearing, credentials forgotten on reload, two isolated profiles, actual offline edits/reconnection, full tracing-image bytes, revoked access/reconnect, a second account, disconnect retention and narrow CSP behaviour. Browser network interception is disabled before transport requests.

The initial prerequisite run passed **4 suites / 57 tests**: protocol simulations, encryption, two-device convergence and accepted accounting. The full existing suite also covers replayed consumption events, independent stitch registers, missing/corrupt/photo-pair attachments, atomic blob publication, explicit note/stock/attachment conflicts and stale local writes. Those tests are retained without weakening expectations.

## Final checks

- `npm test -- --maxWorkers=2`: **349 suites / 4,727 tests / one snapshot passed**.
- `tests/e2e/webdav-sync.spec.js`, tablet Chromium with local CDN assets: **4 passed**, including real server OPTIONS requests and negative default-CSP coverage.
- The dedicated transport suite includes **13 scenarios**, with seven primary cases followed by six separate bug-hunting probes.
- Runtime compilation and Creator bundle freshness, service-worker fingerprints, terminology lint and `git diff --check` passed.
- CSS token lint completed with **13 existing non-blocking advisories** in unchanged declarations; added CSS uses canonical tokens.
- Final focused recovery/protocol/storage/header/fingerprint set: **5 suites / 58 tests passed** after the last recovery fix. No server was provisioned, deployed or merged, and CI was not monitored.

Limits: fixture checks establish the expected WebDAV contract, not the ACL or atomic-write correctness of an arbitrary user's server. Browser evidence is Chromium with tablet emulation, not physical iOS/WebKit. The app is foreground/page-session sync; navigating/reloading requires reconnection. Required setup, CSP/CORS and recovery boundaries are in [the setup guide](webdav-sync.md).
