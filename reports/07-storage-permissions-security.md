# Report 07 — Storage, Permissions, and Security Context

## Summary

The PWA has heavy reliance on client-side storage APIs (IndexedDB, localStorage, sessionStorage) with inconsistent error handling. The app will experience significant failure modes on Safari in private browsing, on Apple devices with older iOS, and potentially during aggressive Intelligent Tracking Prevention conditions.

**Risk Level: HIGH** for Safari/Mac users; **MEDIUM** for Chrome users with aggressive ITP settings.

Key concerns:
- App is completely unusable in Safari private browsing (IndexedDB unavailable, no fallback)
- CDN-loaded React/Babel from cdnjs could be blocked by ITP, causing "React is not defined"
- No warning about Safari's 7-day storage eviction — silent data loss
- BroadcastChannel (multi-tab protection) not available on Safari <15.4
- Bare `sessionStorage` access in [sw-register.js](../sw-register.js) without try/catch

## Findings

### F-01: App Completely Non-Functional in Safari Private Browsing — BLOCKER
- **File**: [helpers.js](../helpers.js#L268), [project-storage.js](../project-storage.js#L180)
- **Code**: `let request = indexedDB.open(DB_NAME, 5);`
- **Issue**: In Safari private browsing mode, `indexedDB.open()` returns a request that fires `onerror` with `NotSupportedError`. No fallback storage mechanism exists. The app cannot function without IndexedDB. User opens the app → all projects fail to load → blank interface. Error appears in console but no user-visible explanation.
- **Severity**: blocker

### F-02: No Warning About Safari's 7-Day Storage Eviction — HIGH
- **File**: All storage-dependent pages
- **Issue**: Safari (pre-17) and older iOS versions evict IndexedDB, localStorage, and service worker cache after 7 days of inactivity. The app provides no warning, no auto-export prompt, and no persistence guarantee. Users who work intermittently are at risk of silent data loss.
- **Severity**: high

### F-03: CDN Resources Could Be Blocked by Safari ITP — HIGH
- **File**: [create.html](../create.html#L64), [home.html](../home.html#L28), [index.html](../index.html#L52), [embroidery.html](../embroidery.html#L19)
- **Code**: `<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/..." crossorigin="anonymous">`
- **Issue**: React, ReactDOM, Babel, Pako, and PDF.js are loaded from cdnjs.cloudflare.com with `crossOrigin="anonymous"`. Under Safari ITP v3.0+, third-party resources may be classified as tracking. If blocked, the app is completely non-functional ("React is not defined").
- **Severity**: high

### F-04: navigator.storage.persist() Cannot Be Called on Safari — HIGH
- **File**: [helpers.js](../helpers.js#L246), lines 246–250
- **Code**: `if (navigator.storage && navigator.storage.persist) { ... }`
- **Issue**: Safari does not support `navigator.storage.persist()`. The feature check passes but `persist()` is never called. iOS Safari users are guaranteed to be in the 7-day eviction window with no way to opt into persistence.
- **Severity**: high

### F-05: BroadcastChannel Multi-Tab Protection Disabled on Safari <15.4 — HIGH
- **File**: [tracker-app.js](../tracker-app.js#L1812), lines 1812–1818
- **Code**: `if(typeof BroadcastChannel==='undefined') return;`
- **Issue**: BroadcastChannel is undefined on Safari <15.4. Multi-tab guard is silently disabled. User can open same pattern in two browser tabs; both trackers save independently, overriding each other's tracking data.
- **Severity**: high

### F-06: Bare sessionStorage Access in sw-register.js — HIGH
- **File**: [sw-register.js](../sw-register.js#L28)
- **Code**: `if (sessionStorage.getItem('cs_pending_image_dataurl')) return;`
- **Issue**: Bare `sessionStorage` access without try/catch. In Safari private browsing or when storage is disabled, this throws `SecurityError` immediately, preventing service worker registration from executing.
- **Severity**: high

### F-07: No Error Toast When IndexedDB Quota Exceeded — MEDIUM
- **File**: [helpers.js](../helpers.js#L306), [project-storage.js](../project-storage.js#L345)
- **Code**: Toast code exists but may not surface reliably if the Toast system itself depends on storage (preferences stored in localStorage). In private browsing, toast may be partially broken.
- **Severity**: medium

### F-08: navigator.storage.estimate() Shows Nothing on Safari — MEDIUM
- **File**: [project-storage.js](../project-storage.js#L640)
- **Code**: `if (navigator.storage && navigator.storage.estimate) { ... }`
- **Issue**: Safari returns `undefined` for `navigator.storage`, so storage quota display is unavailable to Safari users. Users have no visibility into storage consumption.
- **Severity**: medium

### F-09: File System Access API Blocks Folder Sync on Safari — MEDIUM
- **File**: [sync-engine.js](../sync-engine.js#L1892), [preferences-modal.js](../preferences-modal.js#L969)
- **Code**: `if (typeof window.showDirectoryPicker !== 'function') { notify("Folder watching needs a Chromium-based browser...", "err"); return; }`
- **Issue**: Feature detection is present and user-facing error message is shown, but folder-based sync is completely unavailable on Safari/Mac. Safari users cannot set up automatic folder-based sync.
- **Severity**: medium

### F-10: Service Worker Cache Lost After 7-Day Inactivity on Safari — MEDIUM
- **File**: [sw.js](../sw.js)
- **Issue**: Service worker cache entries are cleared after 7 days of inactivity in Safari (ITP). On next load, all assets must be re-fetched. No offline capability. No user notification.
- **Severity**: medium

### F-11: localStorage Key Registry Not Fully Enforced — LOW
- **File**: [constants.js](../constants.js#L14), multiple consumers
- **Code**: `LOCAL_STORAGE_KEYS` registry exists in constants.js but some files still use raw string keys
- **Issue**: Inconsistency risks key name drift when refactoring. Not a security issue, but affects maintainability.
- **Severity**: low

### F-12: IDB onupgradeneeded May Face Transaction Contention on Safari — LOW
- **File**: [helpers.js](../helpers.js#L269), [project-storage.js](../project-storage.js#L181)
- **Issue**: Safari has stricter transaction-lifetime rules. During version upgrade contention across tabs, Safari may fire `onblocked` more frequently than Chrome.
- **Severity**: low

## TODO — Priority-Ordered Fix List

1. **[BLOCKER]** Implement graceful fallback for IndexedDB unavailability in private browsing: Add in-memory storage layer; display banner "Private browsing mode: patterns will not be saved."
2. **[HIGH]** Add user-facing warning about Safari's 7-day storage eviction: Show banner after 5+ days of inactivity: "Your pattern data will be deleted in 2 days unless you visit again."
3. **[HIGH]** Fix bare `sessionStorage` access in [sw-register.js](../sw-register.js#L28): Wrap in try/catch.
4. **[HIGH]** Implement BroadcastChannel fallback using storage events for Safari <15.4: Cross-tab sync via `localStorage` events when BroadcastChannel unavailable.
5. **[HIGH]** Protect against CDN blocking by ITP: Consider self-hosting React/Babel/Pako, or add detection + message "Could not load required libraries from CDN."
6. **[HIGH]** Add auto-export mechanism for approaching storage quota: When quota >80%, offer to export patterns to file.
7. **[MEDIUM]** Improve IndexedDB quota-exceeded error messaging for private browsing mode.
8. **[MEDIUM]** Add Service Worker cache recovery for iOS ITP evictions.
9. **[LOW]** Enforce `LOCAL_STORAGE_KEYS` registry across all files; remove raw string key literals.
10. **[LOW]** Add HTTPS-only warning in Service Worker registration.
