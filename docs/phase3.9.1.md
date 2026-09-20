# SkyReader180 — Phase 3.9.1

## Source basis

This revision is based on Phase 3.8, preserving its cold-start implementation.
Only the verified Phase 3.9 final-spread/Next navigation correction was carried
over.

## Preserved from Phase 3.8

- Cold-start single-flight opening protection.
- Reader-level opening guard.
- Renderer presentation-generation protection.
- Continue Reading and book switching behavior.
- Resume behavior and existing navigation behavior.

## Carried from Phase 3.9

`SRNavigation.next()` now checks whether the final spread is already visible
before advancing. A further Next closes the reader and returns to Library.
Otherwise it advances one spread through `Reader.next()`.

This is the Phase 3.9 correction associated with the verified mouse-wheel
final-page behavior.

## Intentionally not carried from Phase 3.9

No other Phase 3.9 file changes were copied. The supplied Phase 3.8 and Phase
3.9 archives differ in executable code only in `js/navigation.js`; the 3.9
archive additionally contains this phase documentation. Therefore the 3.8
lifecycle implementation remains the base.
