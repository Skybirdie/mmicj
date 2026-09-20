# SkyReader Phase 3.7

## Purpose
Phase 3.7 stabilizes the Reader opening lifecycle after the Phase 3.6 cold-start regression.

## Changes
- `Renderer.open()` no longer unconditionally calls `renderer.close()` on a cold start. A fresh reader now avoids a needless destroy/recreate cycle before the first PDF is loaded.
- Existing-document replacement still uses the normal `renderer.close()` cleanup path.
- Switching from one open book to another is treated as one navigation transaction. The Library is no longer briefly shown between closing book A and opening book B.
- The existing `Sky180FlipEngine` initialization await remains in place, so `Renderer.open()` still waits for StPageFlip initialization.
- Final-spread close behavior is unchanged.
- Continue Reading/change-book behavior is unchanged.
- Resume behavior is unchanged.
- Page indicator and keyboard navigation are unchanged.
- The cover-to-spread visual gap remains intentionally deferred.

## Architecture

Cold start:

Library
→ SRNavigation.openMagazine()
→ Reader.open()
→ Renderer.open()
→ PDF.js
→ Renderer page surfaces
→ Sky180FlipEngine.open()
→ StPageFlip init
→ first page render
→ Reader bookOpened
→ UI reader state

Book switch:

Book A
→ Reader.close()
→ Reader.open(Book B)
→ Book B ready
→ UI updates

Only `sky180flipengine.js` references `St.PageFlip`.
