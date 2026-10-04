# Page-stack ("thick book") - desktop spreads and single-page (mobile) mode

Off by default. Turn it on with Settings -> "Page edges (book thickness)"
(per browser), or open the app once with ?pagestack=1 (?pagestack=0 turns it off).

Files changed: index.html, css/reader.css, js/settingsPanel.js, js/sky180flipengine.js (1.6.4)
New: js/bookStack.js, bookStack.test.mjs (run: node bookStack.test.mjs)

How it works: a pointer-events:none overlay sits behind StPageFlip's wrapper inside the
engine's private host, with a left and right stack of page edges. Thickness follows the
current spread (left grows, right shrinks), eases during a turn, and is 0 on the
cover's left and the last page's right. Hidden in single-page (mobile) and two-page-document
modes. The engine calls it from 5 guarded one-line hooks (ready, read, flipping, resize, close).

Known limits: the stack is drawn in the margin around the book, so when the window is so
narrow that the book fills the full width there is no room and it shrinks to nothing.
The settings row also appears in the shared Video/Slideshow settings panel.
Not yet tested in your live app (pdf.js, embedded videos, Share mode, Apple devices).

Rollback: remove the bookStack.js <script> tag, or leave the setting off.

Update 1.1 (cover/last-page timing): a side with no real page never shows a stack.
- Turning onto the cover (or onto the last page of an even-length book): the stack on the empty side clears in ~0.12s.
- Turning away from the cover (or last page): that side stays at zero for the whole turn and eases in once the turn has settled.
- Direct page jumps (Go button) update the stack instantly.

Update 1.2 (single-page / mobile mode)
- Single-page mode now shows a thin stack on each side (pages read on the left, pages ahead on the right).
- The page fills the phone's width, so the stack is drawn in #viewerArea's own padding gutter
  (8px on phones <=480px, 14px <=700px, 24px <=1000px). No layout change; if a gutter is 0 (some Share-mode
  layouts) that side simply shows nothing.
- Hidden while the reader is zoomed, panned or rotated (also now true on desktop, where the stack would
  otherwise be mispositioned while zoomed). It returns automatically when the transform is back to normal.
- Engine: direct page jumps now read the real current spread (also fixes single-page jumps).
- Two-page-only PDFs (twoPageDocument) still never show a stack.
