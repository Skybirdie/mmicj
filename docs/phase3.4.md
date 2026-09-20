# SkyReader180 — Phase 3.4

## Changes

- Consolidated the duplicate `Reader.on("pageChanged")` UI registration. The page indicator and progress bar now use the same authoritative page-change handler.
- `Sky180FlipEngine` remains the sole StPageFlip dependency.
- Normal page-flip duration remains unchanged. The special cover-to-spread and spread-to-cover transitions use a shorter temporary duration to reduce the visible separation while StPageFlip changes between its single-page cover and two-page landscape state. The normal duration is restored when the flip reaches `read`.
- Resume logic is unchanged from Phase 3.3.

## Expected indicator

For an 11-page book:

`1 / 11` → `2–3 / 11` → `4–5 / 11` → `6–7 / 11`

The indicator is updated from the actual `Reader.pageChanged` event.
