# Sync — Future-Feature Proposals

Implementation proposals for sync features deferred beyond the current
hardening cycle. Each is opinionated, scoped, and includes an effort
estimate and open questions.

| Proposal | Tier | Estimate |
|---|---|---|
| [encrypted-csync-payload.md](encrypted-csync-payload.md) | 2 | ~4–5 person-days |
| [cross-device-handshake.md](cross-device-handshake.md) | 2 | ~7–9 person-days |
| [visual-conflict-diff.md](visual-conflict-diff.md) | 2/3 | ~3.5 person-days |

These are paired with the Tier-1 hardening tests landed in
[tests/syncTier1Hardening.test.js](../../../tests/syncTier1Hardening.test.js)
(34 tests covering Big1 unification, TTL, integrity gate, LRU
eviction, and clock-skew clamp).

## Recommended sequencing

1. **Visual conflict diff** — smallest, no security surface, immediate
   UX win, fits in a single sprint.
2. **Cross-device handshake** — reduces onboarding friction, no
   crypto dependency, ships independently.
3. **Encrypted payload** — highest user-visible risk surface. Land
   only after the handshake is in place so passphrase exchange has a
   natural channel.
