# SkyReader Phase 3.6

## Purpose

Phase 3.6 completes the core navigation/change-book path before Phase 4.

## Changes

- Toolbar Previous/Next now call `SRNavigation.previous()` / `SRNavigation.next()` directly.
- The old `Animation.pageTurn()` implementation remains only as a compatibility shim and is no longer the owner of page movement.
- The Library toolbar control closes the current reader when a book is open, allowing the user to immediately choose another publication.
- Selecting a different publication while a reader is open closes the old reader first and then opens the selected book.
- The navigation `openMagazine` wrapper preserves an explicit `startPage`.
- Shelf and list library cards use the same saved-position logic.
- Final-spread closing remains controlled by `SRNavigation.next()`: a further Next from the final spread closes the reader and returns to the Library.
- Resume behavior, page indicator behavior, PageUp/PageDown, spread navigation, and the cold-launch fix are preserved.
- The cover-to-spread visual gap is intentionally unchanged for later refinement.

## Architecture

All page movement follows:

Library/UI/Keyboard/Wheel
→ SRNavigation
→ Reader
→ Renderer
→ Sky180FlipEngine
→ StPageFlip

Only `sky180flipengine.js` references `St.PageFlip`.
