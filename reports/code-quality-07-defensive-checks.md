# Defensive Checks & Try/Catch Audit — Cross-Stitch Repo

## Trust Boundary Criterion

This audit treats code as **trusted internal paths** unless:
- It directly handles user input (file imports, file pickers)
- It calls indexedDB or localStorage (I/O boundary, subject to quota/corruption)
- It receives data from Web Workers (postMessage)
- It parses untrusted formats (.oxs, .pdf, .json imports)

Within trusted paths, defensive checks that hide real bugs are flagged. Catches at I/O boundaries are legitimate but over-broad catches that swallow specific errors are flagged.

---

## Risk-Ranked Findings

### 1. React Render Functions Wrapped in Try/Catch (High Risk)

These hide bugs in chart/stats logic by catching all exceptions, logging a warning, and returning fallback UI instead of propagating to the error boundary.

- [ ] [components.js](components.js#L151) — `try { ... } catch(e) { console.warn('Stats: MiniStatsBar render error', e); return null; }` — **Masks calculation bugs.** **Action:** Remove try; let error boundary catch.
- [ ] [components.js](components.js#L250) — `try { ... } catch(e) { console.warn('Stats: SessionTimeline render error', e); return React.createElement("p", ...); }` — **Action:** Remove try/catch wrapper.
- [ ] [components.js](components.js#L323) — `try { ... } catch(e) { console.warn('Stats: CumulativeChart render error', e); return null; }` — **Action:** Remove try/catch wrapper.
- [ ] [components.js](components.js#L369) — `try { ... } catch(e) { console.warn('Stats: DailyBarChart render error', e); return null; }` — **Action:** Remove try/catch wrapper.
- [ ] [components.js](components.js#L421) — `try { ... } catch(e) { console.warn('Stats: SpeedTrendChart render error', e); return null; }` — **Action:** Remove try/catch wrapper.
- [ ] [components.js](components.js#L468) — `try { ... } catch(e) { console.warn('Stats: ColourTimeline render error', e); return null; }` — **Action:** Remove try/catch wrapper.
- [ ] [components.js](components.js#L843) — `try { ... } catch(e) { console.warn('Stats: ColourProgress render error', e); return null; }` — **Action:** Remove try/catch wrapper.
- [ ] [components.js](components.js#L1534) — `try { ... } catch(e) { console.warn('Stats: StatsDashboard render error', e); return ... "Stats error — see console."; }` — **Confuses users with "see console" while hiding real bug.** **Action:** Remove try/catch wrapper; rely on Error Boundary.

### 2. JSON.parse(localStorage.getItem(...)) With Silent Fallback (High Risk)

If localStorage is corrupted or truncated, silently returning a default masks data loss.

- [ ] [project-storage.js](project-storage.js#L749) — `try { return JSON.parse(localStorage.getItem('cs_projectStates') || '{}'); } catch(e) { return {}; }` — **Silently loses project states (active/queued/paused/complete).** **Action:** Log error; consider full reset; warn user.
- [ ] [tracker-app.js](tracker-app.js#L759) — `try{return !!JSON.parse(localStorage.getItem('cs_lockDetail')||'false');}catch(_){return false;}` — **Corrupted preference fall-back without warning.** **Action:** Log and reset.

### 3. IndexedDB Error Handler That Resolves Instead of Rejects (High Risk)

- [ ] [sync-engine.js](sync-engine.js#L706) — `req.onerror = function () { resolve(null); };` — **Caller cannot distinguish "not found" from "I/O error".** **Action:** `req.onerror = function () { reject(req.error); };`

### 4. Empty Catch Blocks (High Risk)

- [ ] [backup-restore.js](backup-restore.js#L96) — `catch (e) {}` — Silently swallows error reading store from backup. **Action:** Log warning or rethrow.
- [ ] [backup-restore.js](backup-restore.js#L152) — `catch (e) {}` — Same. **Action:** Log warning or rethrow.
- [ ] [backup-restore.js](backup-restore.js#L202) — `try { localStorage.setItem(key, val); } catch (e) {}` — Quota/denied silently ignored during restore. **Action:** Log; report to user.
- [ ] [command-palette.js](command-palette.js#L59) — `try { sameDocFn(); return; } catch (_) {}` — Same-document nav silently falls back to full page load. **Action:** Rethrow or log.
- [ ] [command-palette.js](command-palette.js#L349) — `try { inputEl.focus(); } catch (_) {}` — OK to leave (race), but add comment.
- [ ] [command-palette.js](command-palette.js#L480) — `setTimeout(...try{ inputEl.focus(); inputEl.select(); }catch(_){})` — Same; add comment explaining race.
- [ ] [command-palette.js](command-palette.js#L502) — `catch (_) {}` — Palette close DOM error swallowed. **Action:** Log or comment.
- [ ] [keyboard-utils.js](keyboard-utils.js#L136) — `try { dismissed = !!localStorage.getItem(HINT_KEY); } catch (_) {}` — User does not see keyboard hint; silent. **Action:** Log in dev.
- [ ] [keyboard-utils.js](keyboard-utils.js#L143) — `try { if (localStorage.getItem(HINT_KEY)) return; } catch (_) {}` — Same. **Action:** Same fix.
- [ ] [keyboard-utils.js](keyboard-utils.js#L165) — `try { setTyping(isTypingTarget(document.activeElement)); } catch (_) {}` — Cross-origin frame possibility; add comment.
- [ ] [keyboard-utils.js](keyboard-utils.js#L177) — `try { localStorage.setItem(HINT_KEY, "1"); } catch (_) {}` — Quota exceeded silent; hint state not saved. **Action:** Log in dev.
- [ ] [keyboard-utils.js](keyboard-utils.js#L180) — `try { window.dispatchEvent(new CustomEvent("cs:openHelp")); } catch (_) {}` — Should not happen. **Action:** Rethrow or log.

### 5. Silent Promise Catches With No State Update (High Risk)

Async ops fail silently; caller has no way to know.

- [ ] [manager-app.js](manager-app.js#L322) — `.catch(() => {})` after `ProjectStorage.getStorageEstimate()`. **Action:** Log + error UI state.
- [ ] [manager-app.js](manager-app.js#L365) — `.catch(() => {})` after `ProjectStorage.listProjects()`. **Action:** Add error state UI.
- [ ] [manager-app.js](manager-app.js#L420) — `StashBridge.detectConflicts().then(setConflicts).catch(() => {})`. **Action:** Log; set conflict state to error.
- [ ] [manager-app.js](manager-app.js#L421) — `StashBridge.whatCanIStart().then(setReadyToStart).catch(() => {})`. **Action:** Log; empty/error state.
- [ ] [tracker-app.js](tracker-app.js#L834) — `StashBridge.getGlobalStash().then(setGlobalStash).catch(()=>{})`. **Action:** Fallback empty stash + warn.
- [ ] [tracker-app.js](tracker-app.js#L2019) — `saveProjectToDB(project).catch(()=>{})` — **Data loss risk: user thinks save succeeded.** **Action:** Log + UI toast warning.
- [ ] [tracker-app.js](tracker-app.js#L2020) — `ProjectStorage.save(project).then(...).catch(()=>{})` — Same; data loss risk. **Action:** Log + warn.
- [ ] [tracker-app.js](tracker-app.js#L2682) — `await saveProjectToDB(project).catch(() => {})` — Session end save fails silently. **Action:** Log + warn.
- [ ] [tracker-app.js](tracker-app.js#L2709) — Same pattern. **Action:** Log + warn.
- [ ] [tracker-app.js](tracker-app.js#L2719) — Same pattern. **Action:** Log + warn.
- [ ] [creator-main.js](creator-main.js#L301) — `.catch(() => {})` after `window.StashBridge.getGlobalStash()`. **Action:** Log + empty fallback.
- [ ] [home-screen.js](home-screen.js#L672) — `StashBridge.getGlobalStash().catch(function() { return null; })` — Cannot distinguish "no stash" from "load failed". **Action:** Rethrow or return error object.

### 6. Catch Logs Then Continues (Medium Risk)

- [ ] [command-palette.js](command-palette.js#L376) — `try { a.action(); } catch (e) { console.error('CommandPalette action failed', e); }` — **User unaware action failed.** **Action:** Show toast: `window.Toast.show({message: 'Action failed: ' + e.message, type: 'error'})`.
- [ ] [backup-restore.js](backup-restore.js#L55) — `try { await window.__flushProjectToIDB(); } catch (e) { console.warn("Backup: pre-flush failed:", e); }` — **Backup may contain stale data.** **Action:** Rethrow if critical; otherwise warn user.
- [ ] [backup-restore.js](backup-restore.js#L237) — `catch (e) { console.warn('Post-restore stash migration failed:', e); }` — **Action:** Rethrow or show modal warning.
- [ ] [backup-restore.js](backup-restore.js#L244) — `catch (e) { console.warn('Post-restore project migration failed:', e); }` — **Action:** Rethrow or warn user.
- [ ] [components.js](components.js#L1045) — `catch(e){console.warn('Snapshot save error',e);}` — Snapshot lost silently. **Action:** Show toast.
- [ ] [manager-app.js](manager-app.js#L1177) — `try { fullProject = await ProjectStorage.get(p.id); } catch (err) { console.error("Capture before delete failed:", err); }` — **Pre-delete capture fails but deletion proceeds.** **Action:** Block delete or rethrow.

### 7. Typeof Function Checks on Internal Callbacks (Medium Risk)

These mask initialization bugs where functions are undefined at runtime.

- [ ] [creator-main.js](creator-main.js#L263) — `if(typeof state.setModal==='function') state.setModal('help');` — state.setModal guaranteed. **Action:** Remove check.
- [ ] [creator-main.js](creator-main.js#L270) — Same for 'shortcuts'. **Action:** Remove check.
- [ ] [creator-main.js](creator-main.js#L287) — Same for 'shopping_list'. **Action:** Remove check.
- [ ] [creator-main.js](creator-main.js#L300) — `.then(s => { if (!cancelled && typeof state.setGlobalStash === 'function') state.setGlobalStash(s || {}); })` — state.setGlobalStash guaranteed. **Action:** Remove check.
- [ ] [colour-utils.js](colour-utils.js#L126) — `if (allowBlends && typeof findBest.precomputeBlends === 'function') findBest.precomputeBlends(pal);` — **Action:** Document why optional or remove check.
- [ ] [components.js](components.js#L1679) — `if (typeof ProjectStorage.getAllStatsSummaries === 'function')` — Singleton method always defined. **Action:** Remove check.
- [ ] [components.js](components.js#L1692) — `if (typeof window.__flushProjectToIDB === 'function')` — **Action:** Remove check or fail loudly if not set up.
- [ ] [components.js](components.js#L1901) — Same. **Action:** Remove check.
- [ ] [creator-main.js](creator-main.js#L920) — `if((mode==='track'||mode==='stats')&&typeof window.loadTrackerApp==='function') window.loadTrackerApp();` — **Action:** Remove check; let it throw.
- [ ] [creator-main.js](creator-main.js#L1073) — `try{return !!(window.WelcomeWizard&&window.WelcomeWizard.shouldShow('creator'));}catch(_){return false;}` — Defensive chaining + catch hides init issues. **Action:** Remove try/catch; ensure WelcomeWizard exists.

### 8. Array.isArray Guard on Values We Control (Low-Medium Risk)

- [ ] [components.js](components.js#L1672) — `setProjectSummaries(Array.isArray(built) ? built : [])` — `ProjectStorage.buildAllStatsSummaries()` documented to return array. **Action:** Guarantee in producer; remove check.

---

## Legitimate Boundaries — Leave Alone

- `index.html` lines 92–206: localStorage cleanup for old babel cache (quota errors legitimate)
- `backup-restore.js`: try/catch around indexedDB open/read for migration (I/O boundary)
- `helpers.js` line 71: cached DB connection validity test (cache validation)
- `command-palette.js` lines 349, 471, 480: focus/DOM across dynamic elements (safe defensive)
- `creator/bundle.js`: localStorage try/catch for prefs (quota/denial)
- `help-content.js` lines 225, 340: third-party WelcomeWizard reset (external module)
- `header.js` line 133: SyncEngine.getSyncStatus() worker error (legitimate)
- `tracker-app.js` line 1297: navigator.clipboard error (browser API denied)
- `manager-app.js` lines 2061, 2086: navigator.clipboard & navigator.share (browser API)
- `project-storage.js` line 349: StashBridge.unlinkProjectFromLibrary within delete (cross-DB)

---

## Summary & Recommendations

**Highest Priority:**
1. Remove React render try/catch blocks (8 instances, components.js)
2. Fix IndexedDB onerror to reject, not resolve(null) (sync-engine.js:706)
3. Log + warn user on saveProjectToDB failures (tracker-app.js — data loss risk)
4. Fix JSON.parse(localStorage) to log + reset on corruption (project-storage.js, tracker-app.js)

**Medium Priority:**
1. Remove typeof function checks on internal callbacks (creator-main.js, components.js)
2. Add user-facing error UI for async operation failures (manager-app, components)
3. Rethrow or log user-visible errors in command-palette action execution

**Low Priority:**
1. Add comments to DOM manipulation try/catch blocks
2. Document why certain functions have defensive typeof checks
3. Audit post-restore migrations for user-visible error reporting
