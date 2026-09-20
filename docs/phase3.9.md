# SkyReader180 — Phase 3.9

Restores final-spread -> Library behavior while preserving the Phase 3.8
cold-start protections.

- Next is authoritative in SRNavigation.
- Final spread is calculated from total PDF pages.
- Next on the already-visible final spread closes the reader.
- Direct UI Reader.next() calls are routed through SRNavigation.
- Phase 3.8 cold-start guards are preserved.
- Cover-to-first-spread visual gap remains deferred.
